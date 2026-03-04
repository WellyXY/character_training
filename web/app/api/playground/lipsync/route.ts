import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 90;

const BASE_URL = "https://candy-api-test.pika.art/test/api/v1";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const contentType = req.headers.get("content-type") ?? "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 85000);

  try {
    const body = await req.arrayBuffer();
    const response = await fetch(`${BASE_URL}/realtime/session`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": contentType,
      },
      body,
      signal: controller.signal,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return NextResponse.json({ message: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json({ message: String(err) }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
