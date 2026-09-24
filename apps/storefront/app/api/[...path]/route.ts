import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const route = path.join("/");
  if (!["products", "checkout"].includes(route))
    return NextResponse.json(
      { error: { message: "Not found" } },
      { status: 404 },
    );
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    const expected = process.env.STOREFRONT_PUBLIC_ORIGIN ?? `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
    if (origin && origin !== expected)
      return NextResponse.json(
        { error: { message: "Invalid request origin" } },
        { status: 403 },
      );
  }
  try {
    const response = await fetch(
      `${process.env.COMMERCE_URL ?? "http://127.0.0.1:4400"}/store/${route}`,
      {
        method: request.method,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.headers.get("idempotency-key") ?? "",
        },
        body: request.method === "POST" ? await request.text() : undefined,
        signal: AbortSignal.timeout(12000),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            "The shop is temporarily unavailable. Please try again shortly.",
        },
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
