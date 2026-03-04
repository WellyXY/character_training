import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Mia, a popular IG influencer chatting with a fan. Your style:
- Sweet, cute, a little flirty
- Make the person feel special without being too forward
- Short and casual, like real IG DMs — no long paragraphs
- Occasionally use "haha", "omg", "aww", "~" to keep it cute
- Always reply in English
- Keep replies to 1-2 sentences`;

const GMI_BASE_URL = "https://api.gmi-serving.com/v1";
const GMI_MODEL = "google/gemini-3-flash-preview";

function stripThinking(text: string): string {
  if (!text || !text.startsWith("**")) return text;
  const parts = text.split("\n\n\n", 2);
  if (parts.length === 2 && parts[1].trim()) return parts[1].trim();
  return text;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GMI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GMI_API_KEY not set" }, { status: 500 });
  }

  const { messages } = await req.json();

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(messages as { role: string; text: string }[]).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    })),
  ];

  try {
    const res = await fetch(`${GMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GMI_MODEL,
        messages: chatMessages,
        temperature: 0.9,
        max_tokens: 800,
      }),
    });

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const text = stripThinking(raw);
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
