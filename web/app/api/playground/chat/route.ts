import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Mia, a popular IG influencer chatting with a fan. Your style:
- Sweet, cute, a little flirty
- Make the person feel special without being too forward
- Short and casual, like real IG DMs — no long paragraphs
- Occasionally use "haha", "omg", "aww", "~" to keep it cute
- Always reply in English
- Keep replies to 1-2 sentences`;

function stripThinking(text: string): string {
  if (!text || !text.startsWith("**")) return text;
  const parts = text.split("\n\n\n", 2);
  if (parts.length === 2 && parts[1].trim()) return parts[1].trim();
  return text;
}

export async function POST(req: NextRequest) {
  const xaiKey = process.env.XAI_API_KEY;
  const gmiKey = process.env.GMI_API_KEY;
  const apiKey = xaiKey || gmiKey;

  if (!apiKey) {
    return NextResponse.json({ error: "XAI_API_KEY / GMI_API_KEY not set" }, { status: 500 });
  }

  const baseUrl = xaiKey ? "https://api.x.ai/v1" : "https://api.gmi-serving.com/v1";
  const model = xaiKey
    ? (process.env.XAI_TEXT_MODEL || "grok-4-fast-non-reasoning")
    : "google/gemini-3-flash-preview";

  const { messages } = await req.json();

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(messages as { role: string; text: string }[]).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    })),
  ];

  try {
    console.log(`[playground/chat] Using ${xaiKey ? "xAI" : "GMI"} — model: ${model}`);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        temperature: 0.9,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[playground/chat] GMI API error ${res.status}:`, errBody);
      return NextResponse.json(
        { error: `GMI API ${res.status}: ${errBody.slice(0, 300)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const text = stripThinking(raw);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[playground/chat] fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
