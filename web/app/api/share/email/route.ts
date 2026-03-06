import { NextRequest, NextResponse } from "next/server";

// REAL_API_BASE is a server-side env var (no NEXT_PUBLIC_ prefix) set in Railway frontend service.
// Falls back to NEXT_PUBLIC_API_BASE for local dev.
const API_BASE =
  process.env.REAL_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const body = await req.text();

  const targetUrl = `${API_BASE}/api/v1/share/email`;
  console.log(`[share/email] Proxying to ${targetUrl}`);

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body,
    });

    const data = await res.text();
    console.log(`[share/email] Backend responded ${res.status}`);
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[share/email] Failed to reach backend at ${targetUrl}:`, err);
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
