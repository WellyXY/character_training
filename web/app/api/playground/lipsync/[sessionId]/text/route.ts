import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://candy-api-test.pika.art/test/api/v1";

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const body = await req.json();

  const response = await fetch(
    `${BASE_URL}/realtime/session/${params.sessionId}/text`,
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
