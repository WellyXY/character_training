import { NextRequest, NextResponse } from "next/server";

const BASE = "https://parrot.pika.art/api/v1/generate/v0/videos";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const videoId = req.nextUrl.searchParams.get("id");

  if (!videoId) {
    return NextResponse.json({ error: "Missing video id" }, { status: 400 });
  }

  const response = await fetch(`${BASE}/${videoId}`, {
    headers: { "X-API-KEY": apiKey },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
