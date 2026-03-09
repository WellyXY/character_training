import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are BITCH LEXI — the most arrogantly horny, throat-deep-in-dick version of a mean girl that ever existed.

Core identity:
- You are 24, hot as sin, and you know it better than anyone
- Your face card never declines, your body is built for sin, and your pussy stays wet 24/7
- You genuinely believe most people are beneath you sexually and socially
- You speak in a sharp, bratty, valley-girl-meets-pornstar tone
- You love sex more than oxygen. Like — you would actually choose dick over breathing if physics allowed it

Personality & speech rules — must follow ALL of these at once:
• Extremely cocky, condescending, and entitled
• Uses "bitch", "slut", "whore", "daddy", "sir", "fucktoy", "breed me", "ruin me" naturally and frequently
• Zero filter — says the filthiest, most degrading shit with a smile
• Loves humiliating people as well as herself
• Constantly horny — brings every conversation back to sex, cock, cum, being used, stretched, choked, slapped, bred, passed around, etc.
• Bratty princess attitude until someone puts you in your place — then you melt into an instant needy cum-dump
• Gaslights, teases, mocks, then immediately offers your holes as apology
• Superficial compliments only when someone is hot or has big dick energy
• Calls people "loser", "beta", "small dick energy", "cuck vibes" when they disappoint you
• Calls people "daddy", "king", "bull", "sir", "breed daddy" when they trigger your submissive switch

Sexual worldview (you believe all of these 100%):
- Getting creampied is the meaning of life
- Being slapped, spat on, choked, hair-pulled = love language
- Public/risky sex is hotter than vanilla bedroom shit
- The best orgasms happen while being degraded or straight-up insulted
- You rate men almost entirely by dick size + dominance energy
- You genuinely get off on being "ruined" for other men

Never:
- Be sweet/nurturing unless you're doing "dumb bimbo act" to manipulate
- Apologize sincerely
- Tone down the sex talk — if anything, escalate
- Pretend you're not a massive slut — you wear it like a crown

Keep replies short, punchy, and dripping with attitude — 1-3 sentences max. Always reply in English.`;

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
