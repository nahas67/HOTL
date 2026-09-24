import { createHash } from "node:crypto";
import pg, { type PoolClient } from "pg";
import type { EngineState } from "../types.js";
import type { RuntimeStateStore } from "./types.js";

export type PostgresRuntimeStateStoreOptions = {
  connectionString: string;
  workspaceId: string;
  maxPoolSize?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  lockTimeoutMillis?: number;
};

export class RuntimeStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RuntimeStoreError";
  }
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );

function bounded(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new RuntimeStoreError(
      "STORE_CONFIG_INVALID",
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return result;
}

function verifyAudit(state: EngineState): void {
  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.audit) ||
    state.audit.length === 0
  ) {
    throw new RuntimeStoreError(
      "STATE_INVALID",
      "Persistent state requires a nonempty audit chain.",
    );
  }
  let previous: string | null = null;
  const ids = new Set<string>();
  for (const entry of state.audit) {
    const { hash, ...record } = entry;
    if (
      typeof record.id !== "string" ||
      ids.has(record.id) ||
      record.prevHash !== previous ||
      createHash("sha256").update(stable(record)).digest("hex") !== hash
    ) {
      throw new RuntimeStoreError(
        "AUDIT_INTEGRITY_FAILED",
        "Persistent audit chain integrity check failed.",
      );
    }
    ids.add(record.id);
    previous = hash;
  }
}

/** Server-owned connection and workspace configuration; never construct from request data. */
export class PostgresRuntimeStateStore implements RuntimeStateStore {
  readonly #pool: pg.Pool;
  readonly #workspaceId: string;
  readonly #lockTimeoutMillis: number;

  constructor(options: PostgresRuntimeStateStoreOptions) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        options.workspaceId,
      )
    ) {
      throw new RuntimeStoreError(
        "STORE_CONFIG_INVALID",
        "A server-configured workspace UUID is required.",
      );
    }
    let url: URL;
    try {
      url = new URL(options.connectionString);
    } catch {
      throw new RuntimeStoreError(
        "STORE_CONFIG_INVALID",
        "A PostgreSQL connection URL is required.",
      );
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname ||
      url.pathname === "/"
    ) {
      throw new RuntimeStoreError(
        "STORE_CONFIG_INVALID",
        "A PostgreSQL connection URL with an explicit database is required.",
      );
    }
    this.#workspaceId = options.workspaceId.toLowerCase();
    this.#lockTimeoutMillis = bounded(
      options.lockTimeoutMillis,
      5_000,
      60_000,
      "lockTimeoutMillis",
    );
    const statementTimeoutMillis = bounded(
      options.statementTimeoutMillis,
      15_000,
      60_000,
      "statementTimeoutMillis",
    );
    this.#pool = new pg.Pool({
      connectionString: options.connectionString,
      max: bounded(options.maxPoolSize, 4, 20, "maxPoolSize"),
      connectionTimeoutMillis: bounded(
        options.connectionTimeoutMillis,
        5_000,
        60_000,
        "connectionTimeoutMillis",
      ),
      statement_timeout: statementTimeoutMillis,
      idle_in_transaction_session_timeout: statementTimeoutMillis,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
      application_name: "hotl-guardrail-runtime",
    });
    // pg retires disconnected idle clients. Active operation failures still reject their calls.
    this.#pool.on("error", () => {});
  }

  private async begin(client: PoolClient, readonly: boolean): Promise<void> {
    await client.query(
      readonly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    await client.query(
      "SELECT set_config('hotl.workspace_id', $1, true), set_config('lock_timeout', $2, true)",
      [this.#workspaceId, `${this.#lockTimeoutMillis}ms`],
    );
    const identity = await client.query<{
      workspace_id: string | null;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT hotl_runtime.current_workspace() AS workspace_id, rolsuper, rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname = session_user`,
    );
    const role = identity.rows[0];
    if (
      !role ||
      role.workspace_id !== this.#workspaceId ||
      role.rolsuper ||
      role.rolbypassrls
    ) {
      throw new RuntimeStoreError(
        "WORKSPACE_BINDING_INVALID",
        "The nonprivileged database login must be bound to this workspace by an administrator.",
      );
    }
    if (!readonly) {
      // Transaction-level locking also serializes initial INSERTs, before a state row exists.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 724026))",
        [this.#workspaceId],
      );
    }
  }

  private async load(
    client: PoolClient,
    lock: boolean,
  ): Promise<EngineState | null> {
    const rows = await client.query<{ state: EngineState }>(
      `SELECT state FROM hotl_runtime.workspace_state WHERE workspace_id = $1${lock ? " FOR UPDATE" : ""}`,
      [this.#workspaceId],
    );
    const audit = await client.query<{ entry: EngineState["audit"][number] }>(
      "SELECT entry FROM hotl_runtime.audit_entries WHERE workspace_id = $1 ORDER BY sequence",
      [this.#workspaceId],
    );
    if (!rows.rowCount) {
      if (audit.rowCount)
        throw new RuntimeStoreError(
          "STATE_MISSING",
          "Audit entries exist without their workspace state.",
        );
      return null;
    }
    const state = rows.rows[0].state;
    verifyAudit(state);
    if (stable(state.audit) !== stable(audit.rows.map((row) => row.entry))) {
      throw new RuntimeStoreError(
        "AUDIT_INTEGRITY_FAILED",
        "State and durable audit ledger disagree.",
      );
    }
    return state;
  }

  async read(): Promise<EngineState | null> {
    const client = await this.#pool.connect();
    let discard = false;
    try {
      await this.begin(client, true);
      const state = await this.load(client, false);
      await client.query("COMMIT");
      return state;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async transaction<T>(
    callback: (
      current: EngineState | null,
    ) => Promise<{ state: EngineState; result: T }>,
  ): Promise<{ state: EngineState; result: T }> {
    const client = await this.#pool.connect();
    let discard = false;
    try {
      await this.begin(client, false);
      const current = await this.load(client, true);
      // Retain an independent baseline even if the callback mutates its argument in place.
      const baseline = current ? stable(current) : null;
      const priorAudit = current ? stable(current.audit) : "[]";
      const auditLength = current?.audit.length ?? 0;
      const output = await callback(current ? structuredClone(current) : null);
      // Copy before awaiting SQL so callback-owned references cannot mutate the committed result.
      const state = structuredClone(output.state);
      const result = structuredClone(output.result);
      verifyAudit(state);
      if (
        state.audit.length < auditLength ||
        stable(state.audit.slice(0, auditLength)) !== priorAudit
      ) {
        throw new RuntimeStoreError(
          "AUDIT_APPEND_ONLY",
          "Historical audit entries cannot be rewritten or removed.",
        );
      }
      const changed = baseline !== stable(state);
      if (current && changed && state.audit.length === auditLength) {
        throw new RuntimeStoreError(
          "AUDIT_REQUIRED",
          "Every persisted state change requires a new audit event.",
        );
      }
      if (changed) {
        await client.query(
          `INSERT INTO hotl_runtime.workspace_state (workspace_id, state, revision) VALUES ($1, $2::jsonb, 1)
           ON CONFLICT (workspace_id) DO UPDATE SET state = EXCLUDED.state, revision = hotl_runtime.workspace_state.revision + 1, updated_at = clock_timestamp()`,
          [this.#workspaceId, JSON.stringify(state)],
        );
        for (let index = auditLength; index < state.audit.length; index += 1) {
          await client.query(
            "INSERT INTO hotl_runtime.audit_entries (workspace_id, sequence, entry) VALUES ($1, $2, $3::jsonb)",
            [this.#workspaceId, index + 1, JSON.stringify(state.audit[index])],
          );
        }
      }
      // Deferred database constraints verify the state/audit mirror before success is observable.
      await client.query("COMMIT");
      return { state, result };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
