import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://candy-api-test.pika.art/test/api/v1";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const apiKey = req.headers.get("x-api-key") ?? "";

  const response = await fetch(
    `${BASE_URL}/realtime/session/${params.sessionId}`,
    { headers: { "X-API-Key": apiKey } }
  );

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const apiKey = req.headers.get("x-api-key") ?? "";

  const response = await fetch(
    `${BASE_URL}/realtime/session/${params.sessionId}`,
    { method: "DELETE", headers: { "X-API-Key": apiKey } }
  );

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
