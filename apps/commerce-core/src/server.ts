import { createCommerceApp } from "./app.js";
import { BullEventPublisher } from "./webhooks.js";
const publisher = process.env.REDIS_URL
  ? new BullEventPublisher(process.env.REDIS_URL)
  : undefined;
const app = createCommerceApp({ publisher });
await app.listen({
  port: Number(process.env.COMMERCE_PORT ?? 4400),
  host: "127.0.0.1",
});
console.log("HOTL commerce gateway on http://127.0.0.1:4400");
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    await app.close();
    await publisher?.close();
    process.exit(0);
  });
