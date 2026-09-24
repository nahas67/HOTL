import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { publishCommerceEvent } from "../lib/commerce-events";

export default async function inventoryEvents({ event }: SubscriberArgs<{ id: string }>) {
  await publishCommerceEvent(event);
}

export const config: SubscriberConfig = {
  event: ["inventory.inventory-level.created", "inventory.inventory-level.updated", "inventory.inventory-level.deleted"],
  context: { subscriberId: "hotl-inventory-events" },
};
