export class GuardrailClient {
  constructor(
    private base = process.env.GUARDRAIL_URL ?? "http://127.0.0.1:4100",
    private token = process.env.HOTL_INTERNAL_TOKEN ??
      "hotl-local-development-token",
  ) {}
  async request(path: string, body?: unknown, idempotencyKey?: string) {
    const response = await fetch(`${this.base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hotl-internal-token": this.token,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(
          result.error?.message ?? "Commerce control service unavailable",
        ),
        { statusCode: response.status, details: result },
      );
    if (result.decision === "deny")
      throw Object.assign(
        new Error(
          `The action was blocked: ${result.reason ?? "GUARDRAIL_DENIED"}`,
        ),
        {
          statusCode: 423,
          details: {
            error: {
              code: result.reason ?? "GUARDRAIL_DENIED",
              message: `The action was blocked: ${result.reason ?? "GUARDRAIL_DENIED"}`,
            },
          },
        },
      );
    return result;
  }
}
