import assert from "node:assert/strict";
import test from "node:test";
import { commerceEnvelope, queueConnection } from "../src/lib/commerce-events";

test("event retries deduplicate while separate inventory updates remain distinct", () => {
  const event = { name: "inventory.inventory-level.updated", data: { id: "ilev_1" }, metadata: { created_at: new Date("2026-09-07T10:00:00Z"), eventGroupId: "workflow-1" } };
  assert.deepEqual(commerceEnvelope(event), commerceEnvelope(event));
  assert.notEqual(commerceEnvelope(event).eventId, commerceEnvelope({ ...event, metadata: { ...event.metadata, eventGroupId: "workflow-2" } }).eventId);
  assert.throws(() => commerceEnvelope({ name: event.name, data: event.data }), /stable Medusa/);
});

test("Redis queue connection preserves database, encoded credentials and TLS", () => {
  const connection = queueConnection("rediss://worker:p%40ss@example.com:6380/3");
  assert.equal(connection.db, 3);
  assert.equal(connection.password, "p@ss");
  assert.equal(connection.port, 6380);
  assert.ok(connection.tls);
  assert.throws(() => queueConnection("https://example.com"), /redis/);
});
