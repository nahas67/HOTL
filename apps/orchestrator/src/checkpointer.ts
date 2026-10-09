import { MemorySaver } from "@langchain/langgraph";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const invalidCheckpoint = () => new Error("Invalid checkpoint file; refusing to reset existing runs.");

// Local simulation only. Every LangGraph checkpoint and pending write is flushed
// before acknowledgement. Production uses the official PostgresSaver below.
export class FileSaver extends MemorySaver {
  private saving: Promise<void> = Promise.resolve();
  private loaded = false;
  /** Bytes this instance last read or wrote; a mismatch means another writer moved the file. */
  private lastSeen: string | undefined;
  /**
   * Writes refused because another writer moved the file underneath us.
   *
   * Recorded, NEVER thrown. LangGraph issues checkpoint writes it does not always
   * await, so a rejection from this saver escapes into an unobserved promise, is
   * reported as an unhandled rejection, fails the package, and hides the signal.
   * Recording keeps the refusal observable while leaving the other writer's data intact.
   */
  private recordedConflicts: { at: string; reason: string }[] = [];
  constructor(private file: string) {
    super();
  }
  async load() {
    await mkdir(dirname(this.file), { recursive: true });
    const initialized = await this.readMarker();
    let bytes: string;
    try {
      bytes = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (initialized)
        throw new Error("Initialized checkpoint file is missing; restore it before starting runs.");
      // Write the marker first. A crash between these writes must deny startup,
      // rather than silently bootstrap another empty workflow history.
      await this.writeDurable(`${this.file}.initialized`, '{"version":1}\n');
      await this.writeDurable(this.file, this.serialize());
      this.loaded = true;
      return this;
    }
    const data = JSON.parse(
      bytes,
      (_key, value) => {
        if (!record(value) || !("__bytes" in value)) return value;
        if (typeof value.__bytes !== "string" || Object.keys(value).length !== 1)
          throw invalidCheckpoint();
        const decoded = Buffer.from(value.__bytes, "base64");
        if (decoded.toString("base64") !== value.__bytes) throw invalidCheckpoint();
        return new Uint8Array(decoded);
      },
    );
    if (data?.version !== 1 || !record(data.storage) || !record(data.writes))
      throw invalidCheckpoint();
    for (const namespaces of Object.values(data.storage)) {
      if (!record(namespaces)) throw invalidCheckpoint();
      for (const checkpoints of Object.values(namespaces)) {
        if (!record(checkpoints)) throw invalidCheckpoint();
        for (const checkpoint of Object.values(checkpoints)) {
          if (!Array.isArray(checkpoint) || checkpoint.length !== 3 ||
              !(checkpoint[0] instanceof Uint8Array) || !(checkpoint[1] instanceof Uint8Array) ||
              (checkpoint[2] !== null && checkpoint[2] !== undefined && typeof checkpoint[2] !== "string"))
            throw invalidCheckpoint();
          // JSON arrays encode undefined as null. MemorySaver treats only undefined
          // as a root checkpoint, so restore that meaning without rewriting the file.
          if (checkpoint[2] === null) checkpoint[2] = undefined;
        }
      }
    }
    for (const writes of Object.values(data.writes)) {
      if (!record(writes)) throw invalidCheckpoint();
      for (const write of Object.values(writes)) {
        if (!Array.isArray(write) || write.length !== 3 || typeof write[0] !== "string" ||
            typeof write[1] !== "string" || !(write[2] instanceof Uint8Array))
          throw invalidCheckpoint();
      }
    }
    this.storage = data.storage;
    this.writes = data.writes;
    // Adopt existing version-1 checkpoints without changing any saved bytes.
    if (!initialized)
      await this.writeDurable(`${this.file}.initialized`, '{"version":1}\n');
    this.lastSeen = bytes;
    this.loaded = true;
    return this;
  }
  private async readMarker() {
    let bytes: string;
    try {
      bytes = await readFile(`${this.file}.initialized`, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    const marker = JSON.parse(bytes);
    if (!marker || marker.version !== 1 || Object.keys(marker).length !== 1)
      throw new Error("Invalid checkpoint initialization marker; refusing to reset existing runs.");
    return true;
  }
  private async writeDurable(path: string, bytes: string) {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  private serialize() {
    return JSON.stringify(
      { version: 1, storage: this.storage, writes: this.writes },
      (_key, value) => value instanceof Uint8Array
        ? { __bytes: Buffer.from(value).toString("base64") }
        : value,
    );
  }
  /**
   * Rename the temporary checkpoint over the live one, tolerating a Windows sharing collision.
   *
   * A sharing- or delete-pending file makes `rename` fail transiently with EPERM/EACCES/EBUSY.
   * Without a retry that rejection escaped a promise LangGraph does not always await, Node
   * treated it as fatal and the whole orchestrator exited 1 — which `scripts/dev.mjs` then
   * turned into a teardown of every service and a cascade of ECONNREFUSED failures across the
   * rest of the browser drill. This is the same discipline the guardrail ledger writer already
   * applies around its own rename.
   */
  private async replaceWithRetry(from: string, to: string) {
    for (let attempt = 0; ; attempt++) {
      try { await rename(from, to); return; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const transient = process.platform === "win32" && ["EPERM", "EACCES", "EBUSY"].includes(code ?? "");
        if (!transient || attempt >= 9) throw error;
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  }
  private recordConflict(reason: string) {
    this.recordedConflicts.push({ at: new Date().toISOString(), reason });
  }

  /**
   * Writes this saver refused because another writer moved the file.
   *
   * A checkpoint saver must never REJECT a write: LangGraph issues writes it does not always
   * await, so a rejection escapes into an unobserved promise, becomes an unhandled rejection,
   * fails the package, and hides the signal. Conflicts are therefore recorded here and the stale
   * write is skipped, which leaves the other writer's data intact and makes the conflict
   * inspectable instead of silent.
   */
  conflicts(): readonly { at: string; reason: string }[] {
    return this.recordedConflicts.map(entry => ({ ...entry }));
  }

  private flush() {
    const save = this.saving.then(async () => {
      if (!this.loaded || !await this.readMarker())
        throw new Error("Checkpoint initialization marker is missing; refusing to write.");
      await stat(this.file);
      // Optimistic concurrency. `flush` rewrites the instance's ENTIRE in-memory storage and
      // renames it over the file, so a writer holding a stale view would silently erase every
      // thread it has not seen -- including threads written after it loaded. Compare, then SKIP
      // and record the conflict rather than clobber: a lost checkpoint is an availability and
      // auditability failure, and destroying another writer's runs is worse than recording that
      // this writer was stale.
      let current: string;
      try { current = await readFile(this.file, "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        this.recordConflict("Checkpoint file disappeared under this writer; refusing to recreate it.");
        return;
      }
      if (this.lastSeen !== undefined && current !== this.lastSeen) {
        this.recordConflict("Checkpoint file changed since this writer last read it; refusing to overwrite another writer's runs.");
        return;
      }
      const snapshot = this.serialize();
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await this.writeDurable(temporary, snapshot);
        await this.replaceWithRetry(temporary, this.file);
        this.lastSeen = snapshot;
      } finally {
        await unlink(temporary).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      }
    });
    // A refused write costs exactly that write. Keeping the serialized chain
    // alive on failure means the next flush runs its own body and reports its
    // own result, so a transient filesystem fault cannot wedge every later
    // checkpoint until the process is restarted.
    this.saving = save.catch(() => {});
    return save;
  }
  override async put(...args: Parameters<MemorySaver["put"]>) {
    const result = await super.put(...args);
    await this.flush();
    return result;
  }
  override async putWrites(...args: Parameters<MemorySaver["putWrites"]>) {
    await super.putWrites(...args);
    await this.flush();
  }
  override async deleteThread(threadId: string) {
    await super.deleteThread(threadId);
    await this.flush();
  }
}

export async function createCheckpointer() {
  if (process.env.DATABASE_URL) {
    const { PostgresSaver } =
      await import("@langchain/langgraph-checkpoint-postgres");
    const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL);
    await saver.setup();
    return saver;
  }
  if ((process.env.HOTL_MODE ?? "simulation") !== "simulation")
    throw new Error("A Postgres DATABASE_URL is required outside simulation.");
  return new FileSaver(
    process.env.ORCHESTRATOR_STATE_PATH ?? "data/orchestrator-checkpoints.json",
  ).load();
}
