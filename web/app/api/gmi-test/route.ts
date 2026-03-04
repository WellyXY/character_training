import { NextRequest, NextResponse } from "next/server";

const GMI_BASE = "https://api.gmi-serving.com/v1";

function getKey() {
  return process.env.GMI_API_KEY ?? "";
}

// GET /api/gmi-test?action=models
// POST /api/gmi-test  { model, messages: [{role, content: string | [{type,text},{type,image_url,image_url:{url}}] }] }
export async function GET() {
  const key = getKey();
  const res = await fetch(`${GMI_BASE}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  return NextResponse.json(data);
}

function stripImageContent(messages: any[]): any[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    const textParts = msg.content.filter((p: any) => p.type === "text");
    if (textParts.length === 0) return { ...msg, content: "" };
    if (textParts.length === 1) return { ...msg, content: textParts[0].text ?? "" };
    return { ...msg, content: textParts };
  });
}

export async function POST(req: NextRequest) {
  const key = getKey();
  const { model, messages } = await req.json();

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const payload = { model, messages, max_tokens: 1024, temperature: 0.7 };

  const res = await fetch(`${GMI_BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 400) {
    const errorData = await res.json();
    const errorMsg = JSON.stringify(errorData);
    if (errorMsg.includes("unsupported content type") && errorMsg.includes("image_url")) {
      const retryPayload = { ...payload, messages: stripImageContent(messages) };
      const retryRes = await fetch(`${GMI_BASE}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(retryPayload),
      });
      const retryData = await retryRes.json();
      return NextResponse.json(retryData, { status: retryRes.status });
    }
    return NextResponse.json(errorData, { status: 400 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
