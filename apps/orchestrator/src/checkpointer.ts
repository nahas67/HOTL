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
  private flush() {
    const save = this.saving.then(async () => {
      if (!this.loaded || !await this.readMarker())
        throw new Error("Checkpoint initialization marker is missing; refusing to write.");
      await stat(this.file);
      const snapshot = this.serialize();
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await this.writeDurable(temporary, snapshot);
        await rename(temporary, this.file);
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
