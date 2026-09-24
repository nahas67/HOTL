import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { publishCommerceEvent } from "../lib/commerce-events";

export default async function orderEvents({ event }: SubscriberArgs<{ id: string }>) {
  // Do not swallow queue failures: Medusa's Redis event bus retries this delivery.
  await publishCommerceEvent(event);
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled", "order.fulfillment_created"],
  context: { subscriberId: "hotl-order-events" },
};
