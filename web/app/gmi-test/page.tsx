"use client";

import { useEffect, useRef, useState } from "react";

interface Model {
  id: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  loading?: boolean;
  error?: boolean;
  elapsed?: number;
}

export default function GmiTestPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/gmi-test")
      .then((r) => r.json())
      .then((d) => {
        const list: Model[] = d.data ?? [];
        setModels(list);
        if (list.length > 0) setSelectedModel(list[0].id);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const handleImage = (file: File) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      // Resize to max 1024px to keep payload small
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      setImageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const buildMessages = (): Message[] => {
    const msgs: Message[] = [];
    for (const t of turns) {
      if (t.role === "user") {
        if (t.imageUrl) {
          msgs.push({
            role: "user",
            content: [
              { type: "text", text: t.text },
              { type: "image_url", image_url: { url: t.imageUrl } },
            ],
          });
        } else {
          msgs.push({ role: "user", content: t.text });
        }
      } else {
        msgs.push({ role: "assistant", content: t.text });
      }
    }
    return msgs;
  };

  const confirmUrl = () => {
    const url = urlInputValue.trim();
    if (url) {
      setImageDataUrl(url);
      setUrlInputValue("");
      setUrlInputVisible(false);
    }
  };

  const send = async () => {
    if (!input.trim() && !imageDataUrl) return;
    if (!selectedModel) return;

    const userTurn: Turn = { role: "user", text: input.trim(), imageUrl: imageDataUrl ?? undefined };
    const asstTurn: Turn = { role: "assistant", text: "", loading: true };

    setTurns((prev) => [...prev, userTurn, asstTurn]);
    setInput("");
    setImageDataUrl(null);
    setLoading(true);

    const history = buildMessages();
    if (userTurn.imageUrl) {
      history.push({
        role: "user",
        content: [
          { type: "text", text: userTurn.text },
          { type: "image_url", image_url: { url: userTurn.imageUrl } },
        ],
      });
    } else {
      history.push({ role: "user", content: userTurn.text });
    }

    const start = Date.now();
    try {
      const res = await fetch("/api/gmi-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, messages: history }),
      });
      const data = await res.json();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const text = data?.choices?.[0]?.message?.content ?? JSON.stringify(data?.error ?? data);
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", text, elapsed: parseFloat(elapsed) };
        return next;
      });
    } catch (err) {
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", text: String(err), error: true };
        return next;
      });
    }
    setLoading(false);
  };

  const filteredModels = models.filter((m) =>
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white flex flex-col" style={{ fontFamily: "monospace" }}>
      {/* Header */}
      <div className="border-b border-[#222] px-6 py-3 flex items-center justify-between">
        <span className="text-[15px] font-bold text-white">GMI Model Tester</span>
        <span className="text-[12px] text-gray-500">{models.length} models loaded</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: model list */}
        <div className="w-64 border-r border-[#222] flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-[#222]">
            <input
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search models…"
              className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-[13px] placeholder:text-gray-600 focus:outline-none focus:border-[#444]"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredModels.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedModel(m.id); setTurns([]); }}
                className={`w-full text-left px-3 py-2 text-[12px] border-b border-[#1a1a1a] transition-colors truncate ${
                  selectedModel === m.id
                    ? "bg-white text-black font-bold"
                    : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                }`}
              >
                {m.id}
              </button>
            ))}
          </div>
        </div>

        {/* Main: chat */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Active model badge */}
          <div className="px-5 py-2 border-b border-[#1a1a1a] flex items-center gap-2">
            <span className="text-[11px] text-gray-500">MODEL</span>
            <span className="text-[13px] text-green-400 font-bold truncate">{selectedModel || "—"}</span>
            <button
              onClick={() => setTurns([])}
              className="ml-auto text-[11px] text-gray-600 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {turns.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                <span className="text-[14px]">Select a model and send a message</span>
                <span className="text-[12px]">Upload a file or paste an image URL to test vision</span>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex gap-3 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                {t.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-[#222] border border-[#333] flex-shrink-0 flex items-center justify-center text-[11px] text-gray-400 mt-0.5">
                    AI
                  </div>
                )}
                <div className={`max-w-[70%] flex flex-col gap-1.5 ${t.role === "user" ? "items-end" : "items-start"}`}>
                  {t.imageUrl && (
                    <img src={t.imageUrl} alt="upload" className="max-w-[240px] rounded-xl border border-[#333]" />
                  )}
                  {(t.text || t.loading) && (
                  <div className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                    t.role === "user"
                      ? "bg-white text-black"
                      : t.error
                      ? "bg-red-900/30 border border-red-800 text-red-300"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-gray-200"
                  }`}>
                    {t.loading ? (
                      <span className="flex items-center gap-2 text-gray-500">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Thinking…
                      </span>
                    ) : t.text}
                  </div>
                  )}
                  {t.elapsed && (
                    <span className="text-[11px] text-gray-600">{t.elapsed}s</span>
                  )}
                </div>
                {t.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-white flex-shrink-0 flex items-center justify-center text-[11px] text-black font-bold mt-0.5">
                    U
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Image preview */}
          {imageDataUrl && (
            <div className="px-5 pb-2 flex items-center gap-2">
              <img src={imageDataUrl} alt="preview" className="h-16 rounded-lg border border-[#333]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-gray-500 max-w-[200px] truncate">
                  {imageDataUrl.startsWith("data:") ? "file upload (base64)" : imageDataUrl}
                </span>
                <button
                  onClick={() => setImageDataUrl(null)}
                  className="text-[12px] text-gray-500 hover:text-red-400 transition-colors text-left"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* URL input row */}
          {urlInputVisible && (
            <div className="px-5 pb-2 flex items-center gap-2">
              <input
                autoFocus
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmUrl();
                  if (e.key === "Escape") { setUrlInputVisible(false); setUrlInputValue(""); }
                }}
                placeholder="Paste image URL (https://…)"
                className="flex-1 bg-[#161616] border border-[#3a3a3a] rounded-xl px-4 py-2 text-[13px] placeholder:text-gray-600 focus:outline-none focus:border-[#666]"
              />
              <button
                onClick={confirmUrl}
                className="px-3 py-2 rounded-xl bg-[#2a2a2a] text-[13px] text-gray-300 hover:bg-[#3a3a3a] transition-colors flex-shrink-0"
              >
                Set
              </button>
              <button
                onClick={() => { setUrlInputVisible(false); setUrlInputValue(""); }}
                className="text-[12px] text-gray-600 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-5 pb-5 pt-2 border-t border-[#1a1a1a] flex gap-2 items-end">
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2.5 rounded-xl border border-[#2a2a2a] bg-[#161616] text-gray-500 hover:text-white hover:border-[#444] transition-colors flex-shrink-0"
              title="Upload image file (base64)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => { setUrlInputVisible((v) => !v); setUrlInputValue(""); }}
              className={`p-2.5 rounded-xl border transition-colors flex-shrink-0 text-[11px] font-bold ${urlInputVisible ? "border-[#555] bg-[#222] text-white" : "border-[#2a2a2a] bg-[#161616] text-gray-500 hover:text-white hover:border-[#444]"}`}
              title="Paste image URL (recommended for Gemini/vision models)"
            >
              URL
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[14px] placeholder:text-gray-600 focus:outline-none focus:border-[#444] resize-none disabled:opacity-50 transition-colors"
              style={{ minHeight: 44, maxHeight: 160 }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
            />
            <button
              onClick={send}
              disabled={loading || (!input.trim() && !imageDataUrl)}
              className="px-4 py-2.5 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
