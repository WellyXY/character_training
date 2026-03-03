import { NextRequest, NextResponse } from "next/server";

const ENDPOINT =
  "https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const formData = await req.formData();

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "X-API-KEY": apiKey },
    body: formData,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
