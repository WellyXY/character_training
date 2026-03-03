import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://candy-api-test.pika.art/test/api/v1";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const formData = await req.formData();

  const response = await fetch(`${BASE_URL}/api/realtime/session`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: formData,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
