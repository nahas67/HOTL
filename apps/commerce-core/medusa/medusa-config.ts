import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV ?? "development", process.cwd());

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured; see .env.example`);
  return value;
}

module.exports = defineConfig({
  admin: { disable: true },
  projectConfig: {
    databaseUrl: required("MEDUSA_DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    http: {
      storeCors: process.env.STORE_CORS ?? "http://localhost:3001",
      adminCors: process.env.ADMIN_CORS ?? "http://localhost:7001",
      authCors: process.env.AUTH_CORS ?? "http://localhost:3001,http://localhost:7001",
      jwtSecret: required("MEDUSA_JWT_SECRET"),
      cookieSecret: required("MEDUSA_COOKIE_SECRET"),
    },
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [{
          resolve: "./src/modules/guarded-payment",
          id: "guarded",
          options: { guardrailUrl: required("GUARDRAIL_URL"), guardrailToken: required("MEDUSA_GUARDRAIL_TOKEN") },
        }],
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: required("REDIS_URL"),
        queueName: "medusa-events",
        jobOptions: { attempts: 10, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { age: 604800 }, removeOnFail: false },
      },
    },
  ],
});
