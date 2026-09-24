import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/[...path]/route";
import {
  forwardShopifyCallback,
  shopifyCookie,
  shopifyMutationSchema,
} from "./shopify-proxy";

const nonce = "a".repeat(43);
const cookie = `hotl_shopify_oauth=${nonce}; Path=/api/shopify/oauth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
const clearCookie =
  "hotl_shopify_oauth=; Path=/api/shopify/oauth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
const uuid = "b403a42c-5660-47f3-92da-47a98185352f";
const context = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});
const request = (
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost:3000/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hotl-cockpit": "1",
      "Idempotency-Key": "owner-operation-key",
      Origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Shopify owner proxy", () => {
  it("allows only typed Shopify mutations and binds revisions in proposals", () => {
    for (const path of [
      "shopify/credentials",
      "shopify/oauth/callback",
      "shopify/webhooks/" + uuid,
      "shopify/prices/not-a-uuid/execute",
      "shopify/prices/" + uuid + "/delete",
    ])
      expect(shopifyMutationSchema(path.split("/"))).toBeNull();
    const schema = shopifyMutationSchema(["shopify", "prices", "propose"])!;
    const input = {
      installationId: uuid,
      variantId: "gid://shopify/ProductVariant/123",
      expectedRevision: 2,
      expectedConstitutionVersion: 3,
      price: "25.00",
      reason: "Current cost evidence reviewed",
    };
    expect(schema.safeParse(input).success).toBe(true);
    expect(
      schema.safeParse({ ...input, expectedRevision: undefined }).success,
    ).toBe(false);
    const webhook = shopifyMutationSchema(["shopify", "installations", uuid, "subscriptions", "ensure"])!;
    expect(webhook.safeParse({ topic: "products/update" }).success).toBe(true);
    expect(webhook.safeParse({ topic: "orders/create" }).success).toBe(false);
    expect(webhook.safeParse({ topic: "products/update", force: true }).success).toBe(false);
    const investigation = shopifyMutationSchema(["shopify", "prices", uuid, "investigations"])!;
    const review = { expectedStatus: "UNKNOWN", expectedReconciliationAt: null, expectedReconciliationRevision: null, nextStep: "INVESTIGATE_PROVIDER_LOGS",
      note: "Review the provider event history before any new price action.", evidence: [] };
    expect(investigation.safeParse(review).success).toBe(true);
    expect(investigation.safeParse({ ...review, expectedStatus: "CONFIRMED" }).success).toBe(false);
    expect(investigation.safeParse({ ...review, clearLock: true }).success).toBe(false);
    expect(
      schema.safeParse({ ...input, workspaceId: "client-asserted-workspace" })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...input, price: "25e2" }).success).toBe(false);
  });
  it("rejects cross-origin installation and missing cockpit header without calling guardrails", async () => {
    vi.stubEnv("HOTL_PUBLIC_ORIGIN", "http://localhost:3000");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await POST(
          request(
            "shopify/install",
            { shop: "demo.myshopify.com" },
            { Origin: "https://other.example" },
          ),
          context("shopify/install"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          request(
            "shopify/install",
            { shop: "demo.myshopify.com" },
            { "x-hotl-cockpit": "" },
          ),
          context("shopify/install"),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires owner authentication outside local simulation", async () => {
    vi.stubEnv("HOTL_MODE", "live");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await GET(
          new Request("http://localhost:3000/api/shopify"),
          context("shopify"),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards the owner identity and secure nonce cookie through install", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            authorizationUrl:
              "https://demo.myshopify.com/admin/oauth/authorize",
            stateId: uuid,
          },
          { headers: { "Set-Cookie": cookie } },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request(
        "shopify/install",
        { shop: "demo.myshopify.com" },
        { Authorization: "Bearer owner-jwt-example" },
      ),
      context("shopify/install"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(cookie);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch.mock.calls[0][0]).toMatch(
      /\/api\/guardrails\/v1\/shopify\/install$/,
    );
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer owner-jwt-example",
        "Idempotency-Key": "owner-operation-key",
      },
      body: JSON.stringify({ shop: "demo.myshopify.com" }),
    });
  });
  it("fails an install response with missing or unsafe cookie attributes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {
              authorizationUrl:
                "https://demo.myshopify.com/admin/oauth/authorize",
            },
            { headers: { "Set-Cookie": cookie.replace("; HttpOnly", "") } },
          ),
        ),
    );
    expect(
      (
        await POST(
          request(
            "shopify/install",
            { shop: "demo.myshopify.com" },
            { Authorization: "Bearer owner-jwt-example" },
          ),
          context("shopify/install"),
        )
      ).status,
    ).toBe(502);
    for (const value of [
      cookie + "; Domain=example.com",
      cookie.replace("Path=/api/shopify/oauth/callback", "Path=/"),
      cookie.replace("Secure; ", ""),
      null,
    ])
      expect(shopifyCookie(value)).toBeNull();
  });
  it("rejects arbitrary Shopify proxy routes and malformed revision bodies", async () => {
    vi.stubEnv("HOTL_MODE", "simulation");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await POST(
          request("shopify/credentials"),
          context("shopify/credentials"),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await POST(
          request(`shopify/installations/${uuid}/disconnect`, {}),
          context(`shopify/installations/${uuid}/disconnect`),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects missing, short, oversized or extra cancellation fields before forwarding", async () => {
    vi.stubEnv("HOTL_MODE", "simulation");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const path = `shopify/prices/${uuid}/cancel`;
    for (const body of [
      {},
      { reason: "          " },
      { reason: "too short" },
      { reason: "x".repeat(1001) },
      { reason: "Owner withdrew proposal", status: "CANCELLED" },
    ]) {
      expect((await POST(request(path, body), context(path))).status).toBe(400);
    }
    expect(shopifyMutationSchema(["shopify", "prices", "invalid-id", "cancel"])).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards a trimmed cancellation reason with owner authorization and idempotency", async () => {
    vi.stubEnv("HOTL_MODE", "live");
    const result = { decision: "allow", operationId: uuid, status: "CANCELLED" };
    const fetch = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetch);
    const path = `shopify/prices/${uuid}/cancel`;
    const response = await POST(request(path, { reason: "  Owner withdrew proposal  " }, {
      Authorization: "Bearer owner-jwt-example",
      "Idempotency-Key": "cancel-request-key",
    }), context(path));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(new RegExp(`/api/guardrails/v1/${path}$`)),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer owner-jwt-example",
          "Idempotency-Key": "cancel-request-key",
        }),
        body: JSON.stringify({ reason: "Owner withdrew proposal" }),
      }),
    );
  });
});

describe("Shopify OAuth callback boundary", () => {
  it("preserves the signed query and forwards only its browser nonce, without an owner JWT", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { decision: "allow", installationId: uuid },
          { headers: { "Set-Cookie": clearCookie } },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const query =
      "shop=demo.myshopify.com&state=signed%2Bstate&code=private-code&hmac=signature";
    const result = await forwardShopifyCallback(
      new Request(
        `https://cockpit.example/api/shopify/oauth/callback?${query}`,
        {
          headers: {
            Cookie: `session=private; hotl_shopify_oauth=${nonce}`,
            Authorization: "Bearer never-forward-me",
          },
        },
      ),
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe(
      "/integrations?shopify=connected",
    );
    expect(result.headers.get("set-cookie")).toBe(clearCookie);
    expect(fetch.mock.calls[0][0]).toContain(
      `/api/shopify/oauth/callback?${query}`,
    );
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: { Cookie: `hotl_shopify_oauth=${nonce}` },
      redirect: "error",
      cache: "no-store",
    });
    expect(Object.keys(fetch.mock.calls[0][1].headers)).toEqual(["Cookie"]);
  });
  it("rejects absent or duplicated nonce before contacting guardrails", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const value of [
      "",
      `hotl_shopify_oauth=${nonce}; hotl_shopify_oauth=${nonce}`,
    ])
      expect(
        (
          await forwardShopifyCallback(
            new Request(
              "https://cockpit.example/api/shopify/oauth/callback?code=private",
              { headers: { Cookie: value } },
            ),
          )
        ).status,
      ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("redacts provider failures and ambiguous callback outcomes", async () => {
    for (const response of [
      Response.json({ error: "private-provider-secret" }, { status: 403 }),
      Response.json({ decision: "allow" }),
      new Response("private-provider-secret", { status: 502 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const result = await forwardShopifyCallback(
        new Request(
          "https://cockpit.example/api/shopify/oauth/callback?code=private-code",
          { headers: { Cookie: `hotl_shopify_oauth=${nonce}` } },
        ),
      );
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(await result.text()).not.toMatch(
        /private-provider-secret|private-code/,
      );
      expect(result.headers.get("location")).toBeNull();
    }
  });
});
