import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor, CommerceOrder, Product } from "@hotl/schemas";
import { createEngine, type GuardrailEngine } from "../src/engine.js";
import { seedState } from "../src/seed.js";
import { PostgresRuntimeStateStore } from "../src/stores/postgres.js";
import type { EngineState } from "../src/types.js";

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
function append(state: EngineState, eventType: string): void {
  const record = {
    id: randomUUID(),
    actorType: "system" as const,
    actorId: "postgres-drill",
    eventType,
    payload: {},
    prevHash: state.audit.at(-1)?.hash ?? null,
    createdAt: new Date().toISOString(),
    summary: eventType,
  };
  state.audit.push({
    ...record,
    hash: createHash("sha256").update(canonical(record)).digest("hex"),
  });
}
function initial(): EngineState {
  const state = seedState(false);
  append(state, "drill.initialized");
  return state;
}

describe("PostgreSQL runtime store configuration", () => {
  it.each(["", "owner-test", "00000000-0000-0000-0000-00000000000x"])(
    "rejects a non-UUID workspace without connecting: %s",
    (workspaceId) => {
      expect(
        () =>
          new PostgresRuntimeStateStore({
            connectionString: "postgresql://localhost/hotl",
            workspaceId,
          }),
      ).toThrow("workspace UUID");
    },
  );
  it.each(["", "https://localhost/hotl", "postgresql://localhost/"])(
    "rejects a malformed or implicit database URL: %s",
    (connectionString) => {
      expect(
        () =>
          new PostgresRuntimeStateStore({
            connectionString,
            workspaceId: randomUUID(),
          }),
      ).toThrow("PostgreSQL connection URL");
    },
  );
  it("rejects unbounded pool and timeout settings", () => {
    const options = {
      connectionString: "postgresql://localhost/hotl",
      workspaceId: randomUUID(),
    };
    for (const patch of [
      { maxPoolSize: 0 },
      { maxPoolSize: 21 },
      { connectionTimeoutMillis: 0 },
      { statementTimeoutMillis: 60_001 },
      { lockTimeoutMillis: Infinity },
    ]) {
      expect(
        () => new PostgresRuntimeStateStore({ ...options, ...patch }),
      ).toThrow("positive integer");
    }
  });
});

// The normal workspace suite explicitly skips database tests. The dedicated drill creates a
// disposable cluster and provides this URL; DATABASE_URL is deliberately never inspected.
const testUrl = process.env.HOTL_RUNTIME_TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
if (testUrl) {
  const parsed = new URL(testUrl);
  if (
    process.env.HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE !== "1" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.pathname !== "/hotl_runtime_drill"
  ) {
    throw new Error(
      "Runtime integration tests require the explicitly marked disposable loopback database.",
    );
  }
}

describe.skipIf(!enabled)(
  "PostgreSQL runtime ledger on disposable native PostgreSQL",
  () => {
    let admin: pg.Pool;
    const stores: PostgresRuntimeStateStore[] = [];
    const workspaceUrls = new Map<string, Promise<string>>();
    const scopedUrl = (workspaceId: string): Promise<string> => {
      const existing = workspaceUrls.get(workspaceId);
      if (existing) return existing;
      const provision = (async () => {
        const role = `runtime_${workspaceId.replaceAll("-", "")}`;
        await admin.query(
          `CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`,
        );
        await admin.query(`GRANT hotl_runtime_guardrail TO ${role}`);
        await admin.query(
          "INSERT INTO hotl_runtime.workspace_bindings(login_role,workspace_id) VALUES ($1,$2)",
          [role, workspaceId],
        );
        const parsed = new URL(testUrl!);
        parsed.username = role;
        parsed.password = "";
        return parsed.toString();
      })();
      workspaceUrls.set(workspaceId, provision);
      return provision;
    };
    const store = async (
      workspaceId: string = randomUUID(),
      overrides: { lockTimeoutMillis?: number } = {},
    ) => {
      const instance = new PostgresRuntimeStateStore({
        connectionString: await scopedUrl(workspaceId),
        workspaceId,
        ...overrides,
      });
      stores.push(instance);
      return instance;
    };
    beforeAll(async () => {
      admin = new pg.Pool({
        connectionString: testUrl,
        connectionTimeoutMillis: 5_000,
      });
      expect(
        (await admin.query("SELECT current_database() AS name")).rows[0].name,
      ).toBe("hotl_runtime_drill");
    });
    afterAll(async () => {
      await Promise.all(stores.map((instance) => instance.close()));
      await admin.end();
    });

    const owner: Actor = { type: "owner", id: "database-drill-owner" };
    const marketing: Actor = { type: "agent", id: "marketing_agent" };
    const support: Actor = { type: "agent", id: "support_agent" };
    const fixedNow = () => new Date("2026-09-10T12:00:00.000Z");
    const engine = async (workspaceId: string, initializeEmptyStore = false) =>
      createEngine({
        store: await store(workspaceId),
        initializeEmptyStore,
        seed: false,
        now: fixedNow,
      });
    const createProduct = async (instance: GuardrailEngine) => {
      const result = await instance.createProduct(
        {
          expectedConstitutionVersion: (await instance.snapshot()).constitution!
            .version,
          reason: "Owner creates the disposable integration fixture",
          sku: "DATABASE-FLOW",
          name: "Database flow fixture",
          category: "Test fixtures",
          price: 50,
          landedCost: 20,
          estimatedCac: 5,
          inventory: 8,
          status: "active",
        },
        owner,
        "create-product",
      );
      expect(result.decision).toBe("allow");
      return result.product as Product;
    };
    const auditMirror = async (workspaceId: string) =>
      (
        await admin.query(
          "SELECT entry FROM hotl_runtime.audit_entries WHERE workspace_id=$1 ORDER BY sequence",
          [workspaceId],
        )
      ).rows.map((row: { entry: unknown }) => row.entry);

    describe("real GuardrailEngine with PostgreSQL persistence", () => {
      it("requires explicit first-time initialization and never creates state during a failed normal startup", async () => {
        const workspaceId = randomUUID();
        const instance = await store(workspaceId);
        await expect(
          createEngine({ store: instance, seed: false }),
        ).rejects.toMatchObject({ code: "STATE_MISSING", statusCode: 503 });
        expect(await instance.read()).toBeNull();
        expect(await auditMirror(workspaceId)).toEqual([]);
        const initialized = await engine(workspaceId, true);
        expect((await initialized.snapshot()).audit).toHaveLength(1);
        expect(await (await engine(workspaceId)).snapshot()).toEqual(
          await initialized.snapshot(),
        );
      });

      it("initializes exactly once across independent engine instances", async () => {
        const workspaceId = randomUUID();
        const [first, second] = await Promise.all([
          engine(workspaceId, true),
          engine(workspaceId, true),
        ]);
        const state = await first.snapshot();
        expect(await second.snapshot()).toEqual(state);
        expect(
          state.audit.filter(
            (item) => item.eventType === "simulation.initialized",
          ),
        ).toHaveLength(1);
        expect(state.products).toHaveLength(0);
        expect(state.reservations).toHaveLength(0);
        expect(await auditMirror(workspaceId)).toEqual(state.audit);
      });

      it("enforces the shared spend ceiling during competing real reservations", async () => {
        const workspaceId = randomUUID();
        const [first, second] = await Promise.all([
          engine(workspaceId, true),
          engine(workspaceId, true),
        ]);
        const policy = await first.updateConstitution(
          {
            expectedVersion: 1,
            reason: "Set the shared database reservation budget",
            dailyAdSpendCeiling: 100,
          },
          owner,
          "race-budget",
        );
        expect(policy.decision).toBe("allow");
        const outcomes = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            (index % 2 ? first : second).checkSpend(
              { campaignId: `database-race-${index}`, requestedAmount: 25 },
              owner,
              `database-race-${index}`,
            ),
          ),
        );
        expect(
          outcomes.filter((result) => result.decision === "allow"),
        ).toHaveLength(4);
        expect(
          outcomes.filter(
            (result) => result.reason === "DAILY_CEILING_EXCEEDED",
          ),
        ).toHaveLength(6);
        const state = await first.snapshot();
        expect(state.reservations).toHaveLength(4);
        expect(
          state.reservations.reduce((sum, item) => sum + item.amountMinor, 0),
        ).toBe(10_000);
        expect(
          state.audit.filter((item) => item.eventType === "spend.check"),
        ).toHaveLength(10);
        expect(await second.snapshot()).toEqual(state);
        expect(await auditMirror(workspaceId)).toEqual(state.audit);
      });

      it("preserves immutable replay after closing the client and changing policy", async () => {
        const workspaceId = randomUUID();
        const firstStore = await store(workspaceId);
        const first = await createEngine({
          store: firstStore,
          initializeEmptyStore: true,
          seed: false,
          now: fixedNow,
        });
        const request = {
          campaignId: "persisted-campaign",
          requestedAmount: 5,
          expectedConstitutionVersion: 1,
          expectedRevision: 0,
        };
        const allowed = await first.launchCampaign(
          request,
          marketing,
          "persisted-campaign",
        );
        expect(allowed).toMatchObject({
          decision: "allow",
          status: "launched",
          mode: "simulation",
        });
        await firstStore.close();
        stores.splice(stores.indexOf(firstStore), 1);
        const restarted = await engine(workspaceId);
        expect(
          (
            await restarted.updateConstitution(
              {
                expectedVersion: 1,
                reason: "Owner takes manual control after restart",
                mode: "MANUAL",
              },
              owner,
              "manual-after-restart",
            )
          ).decision,
        ).toBe("allow");
        const beforeReplay = await restarted.snapshot();
        expect(
          await restarted.launchCampaign(
            request,
            marketing,
            "persisted-campaign",
          ),
        ).toEqual(allowed);
        expect(await restarted.snapshot()).toEqual(beforeReplay);
        await expect(
          restarted.launchCampaign(
            { ...request, requestedAmount: 6 },
            marketing,
            "persisted-campaign",
          ),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        await expect(
          restarted.launchCampaign(request, owner, "persisted-campaign"),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        expect(
          await restarted.launchCampaign(
            request,
            marketing,
            "fresh-after-restart",
          ),
        ).toMatchObject({ decision: "deny", reason: "CONSTITUTION_CHANGED" });
        expect(
          await restarted.launchCampaign(
            {
              ...request,
              campaignId: "new-campaign",
              expectedConstitutionVersion: 2,
            },
            marketing,
            "manual-new-action",
          ),
        ).toMatchObject({ decision: "deny", reason: "MANUAL_CONTROL" });
        const after = await restarted.snapshot();
        expect(after.campaigns).toEqual(beforeReplay.campaigns);
        expect(after.reservations).toEqual(beforeReplay.reservations);
        expect(await auditMirror(workspaceId)).toEqual(after.audit);
      });

      it("retains one winning Constitution and product edit across independent engines", async () => {
        const workspaceId = randomUUID();
        const first = await engine(workspaceId, true);
        const product = await createProduct(first);
        const second = await engine(workspaceId);
        const policyChanges = await Promise.all([
          first.updateConstitution(
            {
              expectedVersion: 1,
              reason: "First owner policy edit",
              projectName: "First database owner",
            },
            owner,
            "first-policy",
          ),
          second.updateConstitution(
            {
              expectedVersion: 1,
              reason: "Second owner policy edit",
              projectName: "Second database owner",
            },
            owner,
            "second-policy",
          ),
        ]);
        expect(
          policyChanges.filter((result) => result.decision === "allow"),
        ).toHaveLength(1);
        expect(
          policyChanges.filter(
            (result) => result.reason === "CONSTITUTION_CHANGED",
          ),
        ).toHaveLength(1);
        const current = (await second.snapshot()).constitution!;
        const edits = await Promise.all([
          first.updateProduct(
            product.id,
            {
              expectedConstitutionVersion: current.version,
              expectedRevision: 1,
              reason: "First owner inventory edit",
              inventory: 7,
            },
            owner,
            "first-product-edit",
          ),
          second.updateProduct(
            product.id,
            {
              expectedConstitutionVersion: current.version,
              expectedRevision: 1,
              reason: "Second owner inventory edit",
              inventory: 6,
            },
            owner,
            "second-product-edit",
          ),
        ]);
        const winner = edits.find((result) => result.decision === "allow")!;
        expect(
          edits.filter((result) => result.decision === "allow"),
        ).toHaveLength(1);
        expect(
          edits.filter((result) => result.reason === "RESOURCE_CHANGED"),
        ).toHaveLength(1);
        const state = await first.snapshot();
        expect(state.constitutionHistory).toHaveLength(2);
        expect(state.products[0]).toEqual(winner.after);
        expect(state.products[0]!.revision).toBe(2);
        expect(await second.snapshot()).toEqual(state);
        expect(await auditMirror(workspaceId)).toEqual(state.audit);
      });

      it("persists an order, supplier fulfillment, and one owner-approved refund above $25", async () => {
        const workspaceId = randomUUID();
        const first = await engine(workspaceId, true);
        const product = await createProduct(first);
        expect(
          (
            await first.updateConstitution(
              {
                expectedVersion: 1,
                reason: "Isolate the fixed refund escrow boundary",
                domains: { refunds: { maxAutoActionAmount: 100 } },
              },
              owner,
              "refund-policy",
            )
          ).decision,
        ).toBe("allow");
        const cart = {
          customer: {
            name: "Database Customer",
            email: "database@example.com",
          },
          items: [{ productId: product.id, quantity: 1 }],
        };
        const placed = await first.checkout(cart, owner, "database-checkout");
        expect(placed).toMatchObject({
          decision: "allow",
          paymentStatus: "simulated",
          order: { total: 50, refunded: 0, status: "processing" },
        });
        const order = placed.order as CommerceOrder;
        const restarted = await engine(workspaceId);
        expect(
          await restarted.checkout(cart, owner, "database-checkout"),
        ).toEqual(placed);
        const supplier = await restarted.placeSupplierOrder(
          {
            productId: product.id,
            orderId: order.id,
            quantity: 1,
            expectedConstitutionVersion: 2,
            expectedRevision: 2,
            expectedOrderRevision: 1,
          },
          owner,
          "database-supplier-order",
        );
        expect(supplier).toMatchObject({
          decision: "allow",
          after: { status: "shipped", revision: 2 },
        });
        const escalation = await first.evaluateRefund(
          {
            orderId: order.id,
            amount: 42,
            reasonCode: "damaged",
            expectedConstitutionVersion: 2,
            expectedRevision: 2,
            runId: "database-refund-run",
          },
          support,
          "database-refund",
        );
        expect(escalation).toMatchObject({
          decision: "escalated",
          reason: "REFUND_ESCROW_REQUIRED",
        });
        expect((await restarted.snapshot()).refunds).toHaveLength(0);
        const approvals = await Promise.all([
          first.resolveInterrupt(
            String(escalation.interruptId),
            { decision: "approve" },
            owner,
            "first-refund-approval",
          ),
          restarted.resolveInterrupt(
            String(escalation.interruptId),
            { decision: "approve" },
            owner,
            "second-refund-approval",
          ),
        ]);
        expect(
          approvals.filter((result) => result.status === "resolved"),
        ).toHaveLength(1);
        expect(
          approvals.filter(
            (result) => result.reason === "INTERRUPT_ALREADY_RESOLVED",
          ),
        ).toHaveLength(1);
        const state = await (await engine(workspaceId)).snapshot();
        expect(state.products[0]!.inventory).toBe(7);
        expect(state.orders).toHaveLength(1);
        expect(state.orders[0]).toMatchObject({
          id: order.id,
          total: 50,
          refunded: 42,
        });
        expect(state.supplierOrders).toHaveLength(1);
        expect(state.refunds).toHaveLength(1);
        expect(
          state.interrupts.find((item) => item.id === escalation.interruptId)
            ?.status,
        ).toBe("approved");
        expect(await auditMirror(workspaceId)).toEqual(state.audit);
      });

      it("keeps a below-margin product change out of the persisted catalog", async () => {
        const workspaceId = randomUUID();
        const first = await engine(workspaceId, true);
        const product = await createProduct(first);
        const rejected = await first.updateProduct(
          product.id,
          {
            expectedConstitutionVersion: 1,
            expectedRevision: 1,
            reason: "Attempt a price below the fixed margin floor",
            price: 40,
          },
          owner,
          "below-floor-product",
        );
        expect(rejected).toMatchObject({
          decision: "deny",
          reason: "MARGIN_BELOW_FLOOR",
        });
        const state = await (await engine(workspaceId)).snapshot();
        expect(state.products[0]).toEqual(product);
        expect(state.audit.at(-1)).toMatchObject({
          eventType: "product.update",
          payload: { result: { reason: "MARGIN_BELOW_FLOOR" } },
        });
        expect(await auditMirror(workspaceId)).toEqual(state.audit);
      });

      it("rolls back a real campaign mutation when audit persistence fails and safely retries its key", async () => {
        const workspaceId = randomUUID();
        const first = await engine(workspaceId, true);
        const second = await engine(workspaceId);
        const before = await second.snapshot();
        const request = {
          campaignId: "audit-failure-campaign",
          requestedAmount: 5,
        };
        await admin.query(
          "CREATE FUNCTION hotl_runtime.drill_fail_engine_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Deliberate engine audit write failure'; END $$",
        );
        await admin.query(
          `CREATE TRIGGER drill_fail_engine_audit BEFORE INSERT ON hotl_runtime.audit_entries FOR EACH ROW WHEN (NEW.workspace_id = '${workspaceId}'::uuid AND NEW.entry->>'eventType' = 'campaign.launch') EXECUTE FUNCTION hotl_runtime.drill_fail_engine_audit()`,
        );
        try {
          await expect(
            first.launchCampaign(
              request,
              owner,
              "retry-campaign-after-audit-failure",
            ),
          ).rejects.toThrow("Deliberate engine audit write failure");
          expect(await first.snapshot()).toEqual(before);
          expect(await second.snapshot()).toEqual(before);
          expect(await auditMirror(workspaceId)).toEqual(before.audit);
          expect(
            Object.hasOwn(
              before.idempotency,
              "id:retry-campaign-after-audit-failure",
            ),
          ).toBe(false);
        } finally {
          await admin.query(
            "DROP TRIGGER drill_fail_engine_audit ON hotl_runtime.audit_entries",
          );
          await admin.query(
            "DROP FUNCTION hotl_runtime.drill_fail_engine_audit()",
          );
        }
        const allowed = await second.launchCampaign(
          request,
          owner,
          "retry-campaign-after-audit-failure",
        );
        expect(allowed).toMatchObject({
          decision: "allow",
          status: "launched",
        });
        const committed = await first.snapshot();
        expect(committed.campaigns).toHaveLength(1);
        expect(committed.reservations).toHaveLength(1);
        expect(committed.audit).toHaveLength(before.audit.length + 1);
        expect(
          await first.launchCampaign(
            request,
            owner,
            "retry-campaign-after-audit-failure",
          ),
        ).toEqual(allowed);
        expect(await first.snapshot()).toEqual(committed);
        expect(await auditMirror(workspaceId)).toEqual(committed.audit);
      });

      it.each(["KILL_SWITCH_ENGAGED", "KILL_SWITCH_UNAVAILABLE"])(
        "denies new and reserved financial actions across restart when %s",
        async (reason) => {
          const workspaceId = randomUUID();
          let stopped = false;
          // This injects the emergency-state reader; it is not a deployed revocation drill.
          const killSwitchReader = async () => {
            if (stopped && reason === "KILL_SWITCH_UNAVAILABLE")
              throw new Error("Independent emergency service is unreachable");
            return { engaged: stopped };
          };
          const first = await createEngine({
            store: await store(workspaceId),
            initializeEmptyStore: true,
            seed: false,
            now: fixedNow,
            killSwitchReader,
          });
          const reserved = await first.checkSpend(
            { campaignId: "before-stop", requestedAmount: 1 },
            owner,
            "before-stop",
          );
          expect(reserved.decision).toBe("allow");
          const before = await first.snapshot();
          stopped = true;
          const restarted = await createEngine({
            store: await store(workspaceId),
            seed: false,
            now: fixedNow,
            killSwitchReader,
          });
          const attempts = [
            () =>
              first.checkSpend(
                { campaignId: "after-stop", requestedAmount: 1 },
                owner,
                "after-stop",
              ),
            () =>
              restarted.commitSpend(
                { reservationId: reserved.reservationId },
                owner,
                "commit-after-stop",
              ),
            () =>
              restarted.launchCampaign(
                { campaignId: "launch-after-stop", requestedAmount: 1 },
                owner,
                "launch-after-stop",
              ),
          ];
          for (const attempt of attempts)
            expect(await attempt()).toMatchObject({ decision: "deny", reason });
          const after = await restarted.snapshot();
          expect(after.reservations).toEqual(before.reservations);
          expect(after.campaigns).toEqual(before.campaigns);
          expect(after.audit).toHaveLength(
            before.audit.length + attempts.length,
          );
          expect(await auditMirror(workspaceId)).toEqual(after.audit);
          // A historic receipt is immutable, but replaying it commits no fresh action.
          expect(
            await restarted.checkSpend(
              { campaignId: "before-stop", requestedAmount: 1 },
              owner,
              "before-stop",
            ),
          ).toEqual(reserved);
          expect(await restarted.snapshot()).toEqual(after);
        },
      );

      it("refuses cached reads, historical replay, and new mutations while database storage is unavailable", async () => {
        const workspaceId = randomUUID();
        const first = await engine(workspaceId, true);
        const request = {
          campaignId: "before-database-loss",
          requestedAmount: 5,
        };
        const allowed = await first.launchCampaign(
          request,
          owner,
          "before-database-loss",
        );
        const before = await first.snapshot();
        await admin.query(
          "ALTER TABLE hotl_runtime.workspace_state RENAME TO workspace_state_engine_unavailable",
        );
        try {
          await expect(first.snapshot()).rejects.toBeDefined();
          await expect(
            first.launchCampaign(request, owner, "before-database-loss"),
          ).rejects.toBeDefined();
          await expect(
            first.launchCampaign(
              { campaignId: "during-database-loss", requestedAmount: 1 },
              owner,
              "during-database-loss",
            ),
          ).rejects.toBeDefined();
        } finally {
          await admin.query(
            "ALTER TABLE hotl_runtime.workspace_state_engine_unavailable RENAME TO workspace_state",
          );
        }
        expect(await first.snapshot()).toEqual(before);
        expect(
          await first.launchCampaign(request, owner, "before-database-loss"),
        ).toEqual(allowed);
        expect(await auditMirror(workspaceId)).toEqual(before.audit);
      });
    });

    it("returns null for an uninitialized workspace and commits state plus audit together", async () => {
      const workspaceId = randomUUID();
      const instance = await store(workspaceId);
      expect(await instance.read()).toBeNull();
      const written = await instance.transaction(async (current) => {
        expect(current).toBeNull();
        return { state: initial(), result: { initialized: true } };
      });
      expect(await instance.read()).toEqual(written.state);
      expect(
        (
          await admin.query(
            "SELECT count(*)::int AS count FROM hotl_runtime.audit_entries WHERE workspace_id=$1",
            [workspaceId],
          )
        ).rows[0].count,
      ).toBe(1);
    });

    it("serializes competing reservations on independent database sessions", async () => {
      const workspaceId = randomUUID();
      const first = await store(workspaceId),
        second = await store(workspaceId);
      await first.transaction(async () => ({ state: initial(), result: null }));
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          (index % 2 ? first : second).transaction(async (current) => {
            const state = current!;
            const total = state.reservations.reduce(
              (sum, item) => sum + item.amountMinor,
              0,
            );
            const allowed = total + 2500 <= 10_000;
            // Overlapping callers must observe the previous committed reservation under the lock.
            await new Promise((resolve) => setTimeout(resolve, 5));
            if (allowed)
              state.reservations.push({
                id: randomUUID(),
                campaignId: `race-${index}`,
                amountMinor: 2500,
                agentId: "marketing_agent",
                day: "2026-09-09",
                status: "reserved",
                expiresAt: "2026-09-09T12:15:00Z",
              });
            append(state, allowed ? "drill.reserved" : "drill.denied");
            return { state, result: allowed };
          }),
        ),
      );
      expect(outcomes.filter((item) => item.result)).toHaveLength(4);
      expect((await first.read())!.reservations).toHaveLength(4);
      expect((await second.read())!.audit).toHaveLength(11);
    });

    it("serializes initial creation before a state row exists", async () => {
      const workspaceId = randomUUID();
      const first = await store(workspaceId),
        second = await store(workspaceId);
      const outcomes = await Promise.all(
        [first, second].map((instance) =>
          instance.transaction(async (current) => {
            const state = current ?? initial();
            if (current) append(state, "drill.existing");
            return { state, result: current === null };
          }),
        ),
      );
      expect(outcomes.filter((item) => item.result)).toHaveLength(1);
      expect((await first.read())!.audit).toHaveLength(2);
    });

    it("reads committed state after closing and recreating the client", async () => {
      const workspaceId = randomUUID();
      const first = new PostgresRuntimeStateStore({
        connectionString: await scopedUrl(workspaceId),
        workspaceId,
      });
      const committed = await first.transaction(async () => ({
        state: initial(),
        result: "persisted",
      }));
      await first.close();
      expect(await (await store(workspaceId)).read()).toEqual(committed.state);
    });

    it("rolls back callback failures and preserves the previous state", async () => {
      const instance = await store();
      const before = await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      await expect(
        instance.transaction(async (current) => {
          current!.paused = true;
          append(current!, "drill.uncommitted");
          throw new Error("Deliberate callback failure");
        }),
      ).rejects.toThrow("Deliberate callback failure");
      expect(await instance.read()).toEqual(before.state);
    });

    it("rolls back state and idempotency if audit insertion fails", async () => {
      const workspaceId = randomUUID(),
        instance = await store(workspaceId);
      const before = await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      await admin.query(
        `CREATE FUNCTION hotl_runtime.drill_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Deliberate audit write failure'; END $$`,
      );
      await admin.query(
        `CREATE TRIGGER drill_fail_audit BEFORE INSERT ON hotl_runtime.audit_entries FOR EACH ROW WHEN (NEW.entry->>'eventType' = 'drill.fail') EXECUTE FUNCTION hotl_runtime.drill_fail_audit()`,
      );
      try {
        await expect(
          instance.transaction(async (current) => {
            current!.paused = true;
            current!.idempotency["id:failed"] = {
              fingerprint: "fixture",
              result: { decision: "allow" },
            };
            append(current!, "drill.fail");
            return { state: current!, result: "must not escape" };
          }),
        ).rejects.toThrow("Deliberate audit write failure");
        expect(await instance.read()).toEqual(before.state);
      } finally {
        await admin.query(
          "DROP TRIGGER drill_fail_audit ON hotl_runtime.audit_entries",
        );
        await admin.query("DROP FUNCTION hotl_runtime.drill_fail_audit()");
      }
    });

    it("rejects rewritten history, missing audits, and invalid hash chains", async () => {
      const instance = await store();
      const before = await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      await expect(
        instance.transaction(async (current) => {
          const replacement = initial();
          replacement.paused = current!.paused;
          return { state: replacement, result: null };
        }),
      ).rejects.toMatchObject({ code: "AUDIT_APPEND_ONLY" });
      await expect(
        instance.transaction(async (current) => {
          current!.paused = true;
          return { state: current!, result: null };
        }),
      ).rejects.toMatchObject({ code: "AUDIT_REQUIRED" });
      await expect(
        instance.transaction(async (current) => {
          append(current!, "drill.invalid");
          current!.audit.at(-1)!.hash = "0".repeat(64);
          return { state: current!, result: null };
        }),
      ).rejects.toMatchObject({ code: "AUDIT_INTEGRITY_FAILED" });
      expect(await instance.read()).toEqual(before.state);
    });

    it("preserves a replay without adding a fresh state revision or audit grant", async () => {
      const workspaceId = randomUUID(),
        instance = await store(workspaceId);
      await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      const replay = await instance.transaction(async (current) => ({
        state: current!,
        result: { replayed: true },
      }));
      expect(replay.result).toEqual({ replayed: true });
      expect(
        (
          await admin.query(
            "SELECT revision::int, jsonb_array_length(state->'audit') AS audits FROM hotl_runtime.workspace_state WHERE workspace_id=$1",
            [workspaceId],
          )
        ).rows[0],
      ).toEqual({ revision: 1, audits: 1 });
    });

    it("isolates workspaces under the runtime role and denies audit mutation directly in SQL", async () => {
      const workspaceA = randomUUID(),
        workspaceB = randomUUID();
      await (
        await store(workspaceA)
      ).transaction(async () => ({ state: initial(), result: null }));
      expect(await (await store(workspaceB)).read()).toBeNull();
      await (
        await store(workspaceB)
      ).transaction(async () => ({ state: initial(), result: null }));
      const runtime = new pg.Client({
        connectionString: await scopedUrl(workspaceA),
      });
      await runtime.connect();
      try {
        await runtime.query("SELECT set_config('hotl.workspace_id',$1,false)", [
          workspaceA,
        ]);
        const visible = await runtime.query(
          "SELECT workspace_id FROM hotl_runtime.workspace_state",
        );
        expect(visible.rows).toEqual([{ workspace_id: workspaceA }]);
        expect(
          (
            await runtime.query(
              "SELECT * FROM hotl_runtime.audit_entries WHERE workspace_id=$1",
              [workspaceB],
            )
          ).rowCount,
        ).toBe(0);
        await runtime.query("SELECT set_config('hotl.workspace_id',$1,false)", [
          workspaceB,
        ]);
        expect(
          (await runtime.query("SELECT * FROM hotl_runtime.workspace_state"))
            .rowCount,
        ).toBe(0);
        expect(
          (await runtime.query("SELECT * FROM hotl_runtime.audit_entries"))
            .rowCount,
        ).toBe(0);
        await expect(
          runtime.query(
            "UPDATE hotl_runtime.workspace_bindings SET workspace_id=$1",
            [workspaceB],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await runtime.query("SELECT set_config('hotl.workspace_id',$1,false)", [
          workspaceA,
        ]);
        await expect(
          runtime.query(
            "UPDATE hotl_runtime.audit_entries SET entry=entry WHERE workspace_id=$1",
            [workspaceA],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          runtime.query(
            "DELETE FROM hotl_runtime.workspace_state WHERE workspace_id=$1",
            [workspaceA],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await runtime.end();
      }
      // Even an administrator's ordinary UPDATE/DELETE cannot bypass append-only triggers.
      await expect(
        admin.query(
          "UPDATE hotl_runtime.audit_entries SET entry=entry WHERE workspace_id=$1",
          [workspaceA],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        admin.query(
          "DELETE FROM hotl_runtime.audit_entries WHERE workspace_id=$1",
          [workspaceA],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("rejects a direct state update when its matching audit insert is omitted", async () => {
      const workspaceId = randomUUID(),
        instance = await store(workspaceId);
      const before = await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      const next = structuredClone(before.state);
      next.paused = true;
      append(next, "drill.missing-ledger");
      await expect(
        admin.query(
          "UPDATE hotl_runtime.workspace_state SET state=$2::jsonb, revision=revision+1 WHERE workspace_id=$1",
          [workspaceId, JSON.stringify(next)],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await instance.read()).toEqual(before.state);
    });

    it("rejects a misbound connection instead of treating hidden state as an empty workspace", async () => {
      const workspaceA = randomUUID(),
        workspaceB = randomUUID();
      const misbound = new PostgresRuntimeStateStore({
        connectionString: await scopedUrl(workspaceA),
        workspaceId: workspaceB,
      });
      stores.push(misbound);
      await expect(misbound.read()).rejects.toMatchObject({
        code: "WORKSPACE_BINDING_INVALID",
      });
      let invoked = false;
      await expect(
        misbound.transaction(async () => {
          invoked = true;
          return { state: initial(), result: null };
        }),
      ).rejects.toMatchObject({ code: "WORKSPACE_BINDING_INVALID" });
      expect(invoked).toBe(false);
    });

    it("detects a corrupt hash even when a privileged attacker rewrites both mirrored copies", async () => {
      const workspaceId = randomUUID(),
        instance = await store(workspaceId);
      await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        // This administrator-only corruption fixture never runs against an existing database.
        await client.query(
          "ALTER TABLE hotl_runtime.workspace_state DISABLE TRIGGER USER",
        );
        await client.query(
          "ALTER TABLE hotl_runtime.audit_entries DISABLE TRIGGER USER",
        );
        await client.query(
          `UPDATE hotl_runtime.workspace_state SET state=jsonb_set(state,'{audit,0,hash}',to_jsonb(repeat('0',64))) WHERE workspace_id=$1`,
          [workspaceId],
        );
        await client.query(
          `UPDATE hotl_runtime.audit_entries SET entry=jsonb_set(entry,'{hash}',to_jsonb(repeat('0',64))) WHERE workspace_id=$1`,
          [workspaceId],
        );
        await client.query(
          "ALTER TABLE hotl_runtime.workspace_state ENABLE TRIGGER USER",
        );
        await client.query(
          "ALTER TABLE hotl_runtime.audit_entries ENABLE TRIGGER USER",
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      await expect(instance.read()).rejects.toMatchObject({
        code: "AUDIT_INTEGRITY_FAILED",
      });
      let invoked = false;
      await expect(
        instance.transaction(async (current) => {
          invoked = true;
          return { state: current!, result: null };
        }),
      ).rejects.toMatchObject({ code: "AUDIT_INTEGRITY_FAILED" });
      expect(invoked).toBe(false);
    });

    it("times out contended locks without executing the callback", async () => {
      const workspaceId = randomUUID(),
        instance = await store(workspaceId, { lockTimeoutMillis: 50 });
      const holder = await admin.connect();
      let invoked = false;
      try {
        await holder.query("BEGIN");
        await holder.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,724026))",
          [workspaceId],
        );
        await expect(
          instance.transaction(async () => {
            invoked = true;
            return { state: initial(), result: null };
          }),
        ).rejects.toMatchObject({ code: "55P03" });
        expect(invoked).toBe(false);
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      expect(await instance.read()).toBeNull();
    });

    it("fails when storage is missing instead of returning a cached or empty state", async () => {
      const instance = await store();
      await instance.transaction(async () => ({
        state: initial(),
        result: null,
      }));
      await admin.query(
        "ALTER TABLE hotl_runtime.workspace_state RENAME TO workspace_state_drill_unavailable",
      );
      try {
        await expect(instance.read()).rejects.toMatchObject({ code: "42P01" });
        await expect(
          instance.transaction(async () => ({
            state: initial(),
            result: null,
          })),
        ).rejects.toMatchObject({ code: "42P01" });
      } finally {
        await admin.query(
          "ALTER TABLE hotl_runtime.workspace_state_drill_unavailable RENAME TO workspace_state",
        );
      }
      expect(await instance.read()).not.toBeNull();
    });
  },
);
