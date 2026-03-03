"use client";

import { useRef, useState, useCallback } from "react";
import AppNavbar from "@/components/AppNavbar";
import ProtectedRoute from "@/components/ProtectedRoute";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiId = "lipsync" | "img2vid" | "img2vid-audio";
type ApiStatus = "idle" | "loading" | "polling" | "success" | "error";

interface VideoResponse {
  video_url?: string;
  videoUrl?: string;
  url?: string;
  video_id?: string;
  id?: string;
  status?: string;
  duration?: number;
  error_code?: string;
  message?: string;
  [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_API_KEY = "pika_od5V2jd_vAjF8Ts5h6eIytl9FCyVK2XTv6MRk6qQC9E";
const POLL_INTERVAL = 3000;
const FINISHED_STATUSES = ["finished", "completed", "done", "success"];
const FAILED_STATUSES = ["failed", "error"];

const LIPSYNC_VOICE_ID = "sample_by_welly";
const LIPSYNC_MOTION_PROMPT = "A young person is facing towards the camera while speaking. Their facial expression is emotional and expressive. Their head and body shows little natural movement. The camera maintains focus on their face and upper torso, capturing the emotion and grace of their performance in a static, intimate close-up. Their eyes are expressive, conveying the emotion as their poised presence fills the frame with an engaging energy. Camera Motion: Handheld camera, natural camera motion.";
const LIPSYNC_SILENT_PROMPT = "A young person is facing the camera silently, blinking naturally while keeping their mouth still.";

const APIS: { id: ApiId; label: string }[] = [
  { id: "lipsync", label: "Streaming Lipsync" },
  { id: "img2vid", label: "Image to Video" },
  { id: "img2vid-audio", label: "Image to Video + Audio" },
];

const API_DOCS: Record<ApiId, {
  endpoint: string;
  params: { name: string; type: string; required: boolean; desc: string }[];
  successJson: string;
  polling: string | null;
}> = {
  lipsync: {
    endpoint: "POST https://candy-api.pika.art/test/api/v1/realtime/session",
    params: [
      { name: "image",         type: "file",   required: true,  desc: "Portrait image (JPEG / PNG / WebP)" },
      { name: "voice_id",      type: "string", required: false, desc: "TTS voice ID" },
      { name: "motion_prompt", type: "string", required: false, desc: "Facial motion description" },
      { name: "silent_prompt", type: "string", required: false, desc: "Lipsync text without audio" },
    ],
    successJson: `{\n  "video_url": "https://cdn.pika.art/outputs/abc.mp4",\n  "duration": 3.5\n}`,
    polling: null,
  },
  img2vid: {
    endpoint: "POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2",
    params: [
      { name: "image",       type: "file",   required: true,  desc: "Source image (JPEG / PNG / WebP)" },
      { name: "promptText",  type: "string", required: false, desc: "Motion or scene description" },
      { name: "resolution",  type: "string", required: false, desc: "480p or 720p" },
      { name: "duration",    type: "number", required: false, desc: "Duration in seconds" },
    ],
    successJson: `{\n  "video_id": "550e8400-e29b-41d4-a716-446655440000"\n}`,
    polling: "GET https://parrot.pika.art/api/v1/generate/v0/videos/{video_id}",
  },
  "img2vid-audio": {
    endpoint: "POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio",
    params: [
      { name: "image",       type: "file",   required: true,  desc: "Source image (JPEG / PNG / WebP)" },
      { name: "audio",       type: "file",   required: false, desc: "Audio file (MP3 / WAV / AAC)" },
      { name: "promptText",  type: "string", required: false, desc: "Motion or scene description" },
      { name: "resolution",  type: "string", required: false, desc: "480p or 720p" },
      { name: "duration",    type: "number", required: false, desc: "Duration in seconds" },
    ],
    successJson: `{\n  "video_id": "550e8400-e29b-41d4-a716-446655440000"\n}`,
    polling: "GET https://parrot.pika.art/api/v1/generate/v0/videos/{video_id}",
  },
};

const POLL_STATUSES = [
  { value: "queued",   color: "amber", desc: "Waiting in queue" },
  { value: "started",  color: "amber", desc: "Generating" },
  { value: "finished", color: "green", desc: "Done — video_url available" },
  { value: "failed",   color: "red",   desc: "Generation failed" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function FileDropZone({
  file, previewUrl, accept, icon, hint, onChange,
}: {
  file: File | null;
  previewUrl?: string | null;
  accept: string;
  icon: React.ReactNode;
  hint: string;
  onChange: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onChange(f); }}
      onDragOver={(e) => e.preventDefault()}
      className="border border-dashed border-[#333] rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-[#555] hover:bg-white/[0.02] transition-all"
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-[#161616] flex items-center justify-center flex-shrink-0 text-gray-500">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[15px] text-gray-200 truncate">{file ? file.name : `Click or drop ${hint}`}</p>
        <p className="text-[15px] text-gray-500 mt-0.5">{file ? `${(file.size / 1024).toFixed(0)} KB` : accept.replace("/*", "").replace("/", " / ").toUpperCase()}</p>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{children}</p>;
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#555] font-mono transition-colors"
      />
    </div>
  );
}

function SegmentControl({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 p-1 bg-[#161616] border border-[#2a2a2a] rounded-lg">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`flex-1 py-1.5 rounded-md text-[14px] font-mono font-medium transition-colors ${
            value === o ? "bg-white text-black" : "text-gray-500 hover:text-white"
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function PlaygroundContent() {
  const [activeApi, setActiveApi] = useState<ApiId>("lipsync");
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);

  // Lipsync
  const [lsImage, setLsImage] = useState<File | null>(null);
  const [lsImageUrl, setLsImageUrl] = useState<string | null>(null);

  // img2vid
  const [v2Image, setV2Image] = useState<File | null>(null);
  const [v2ImageUrl, setV2ImageUrl] = useState<string | null>(null);
  const [v2Prompt, setV2Prompt] = useState("");
  const [v2Resolution, setV2Resolution] = useState("720p");
  const [v2Duration, setV2Duration] = useState("");

  // img2vid-audio
  const [vaImage, setVaImage] = useState<File | null>(null);
  const [vaImageUrl, setVaImageUrl] = useState<string | null>(null);
  const [vaPrompt, setVaPrompt] = useState("");
  const [vaResolution, setVaResolution] = useState("720p");
  const [vaDuration, setVaDuration] = useState("");

  // Response
  const [status, setStatus] = useState<ApiStatus>("idle");
  const [responseData, setResponseData] = useState<VideoResponse | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [pollStatusText, setPollStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => { if (pollRef.current) clearTimeout(pollRef.current); };

  const pollVideoStatus = useCallback(async (videoId: string, startTime: number) => {
    try {
      const res = await fetch(`/api/playground/video-status?id=${videoId}`, {
        headers: { "X-API-Key": apiKey },
      });
      const data: VideoResponse = await res.json();
      const st = (data.status ?? "").toLowerCase();
      setPollStatusText(st);
      setResponseData(data);
      const url = data.video_url || data.videoUrl || data.url;
      if (FINISHED_STATUSES.includes(st) && url) {
        setVideoUrl(url as string);
        setElapsed(Math.round((Date.now() - startTime) / 100) / 10);
        setStatus("success");
      } else if (FAILED_STATUSES.includes(st)) {
        setElapsed(Math.round((Date.now() - startTime) / 100) / 10);
        setStatus("error");
      } else {
        pollRef.current = setTimeout(() => pollVideoStatus(videoId, startTime), POLL_INTERVAL);
      }
    } catch {
      pollRef.current = setTimeout(() => pollVideoStatus(videoId, startTime), POLL_INTERVAL);
    }
  }, [apiKey]);

  const resetResponse = () => {
    stopPolling();
    setStatus("idle");
    setResponseData(null);
    setHttpStatus(null);
    setElapsed(null);
    setVideoUrl(null);
    setPollStatusText("");
  };

  const handleSubmit = async () => {
    resetResponse();
    setStatus("loading");
    const start = Date.now();

    try {
      if (activeApi === "lipsync") {
        const fd = new FormData();
        fd.append("image", lsImage!);
        fd.append("voice_id", LIPSYNC_VOICE_ID);
        fd.append("motion_prompt", LIPSYNC_MOTION_PROMPT);
        fd.append("silent_prompt", LIPSYNC_SILENT_PROMPT);
        const res = await fetch("/api/playground/lipsync", { method: "POST", headers: { "X-API-Key": apiKey }, body: fd });
        const data: VideoResponse = await res.json();
        setHttpStatus(res.status);
        setResponseData(data);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);
        const url = data.video_url || data.videoUrl || data.url;
        if (url) setVideoUrl(url as string);
        setStatus(res.ok ? "success" : "error");

      } else if (activeApi === "img2vid") {
        const fd = new FormData();
        fd.append("image", v2Image!);
        if (v2Prompt) fd.append("promptText", v2Prompt);
        fd.append("resolution", v2Resolution);
        if (v2Duration) fd.append("duration", v2Duration);
        const res = await fetch("/api/playground/img2vid", { method: "POST", headers: { "X-API-Key": apiKey }, body: fd });
        const data: VideoResponse = await res.json();
        setHttpStatus(res.status);
        setResponseData(data);
        const videoId = data.video_id || data.id;
        if (res.ok && videoId) {
          setStatus("polling");
          setPollStatusText("queued");
          pollVideoStatus(videoId as string, start);
        } else {
          setElapsed(Math.round((Date.now() - start) / 100) / 10);
          setStatus("error");
        }

      } else {
        const fd = new FormData();
        fd.append("image", vaImage!);
        if (vaPrompt) fd.append("promptText", vaPrompt);
        fd.append("resolution", vaResolution);
        if (vaDuration) fd.append("duration", vaDuration);
        const res = await fetch("/api/playground/img2vid-audio", { method: "POST", headers: { "X-API-Key": apiKey }, body: fd });
        const data: VideoResponse = await res.json();
        setHttpStatus(res.status);
        setResponseData(data);
        const videoId = data.video_id || data.id;
        if (res.ok && videoId) {
          setStatus("polling");
          setPollStatusText("queued");
          pollVideoStatus(videoId as string, start);
        } else {
          setElapsed(Math.round((Date.now() - start) / 100) / 10);
          setStatus("error");
        }
      }
    } catch (err) {
      setResponseData({ message: String(err) });
      setStatus("error");
    }
  };

  const canSubmit =
    !!apiKey &&
    status !== "loading" &&
    status !== "polling" &&
    (activeApi === "lipsync" ? !!lsImage :
     activeApi === "img2vid" ? !!v2Image : !!vaImage);

  const switchApi = (id: ApiId) => { resetResponse(); setActiveApi(id); };
  const isRunning = status === "loading" || status === "polling";
  const doc = API_DOCS[activeApi];

  return (
    <div className="fixed inset-0 bg-[#0c0c0c] text-gray-200 flex flex-col">
      <AppNavbar />

      <div className="flex flex-1 min-h-0 pt-[52px]">

        {/* ── LEFT: Form panel ── */}
        <div className="w-[340px] flex-shrink-0 border-r border-[#222] flex flex-col">

          {/* API tabs */}
          <div className="flex-shrink-0 border-b border-[#222] p-3 flex flex-col gap-1">
            {APIS.map((api) => (
              <button key={api.id} onClick={() => switchApi(api.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-[15px] font-medium transition-colors flex items-center justify-between ${
                  activeApi === api.id
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}>
                {api.label}
                {activeApi === api.id && (
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            {/* API key */}
            <div>
              <Label>X-API-Key</Label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#555] font-mono transition-colors"
              />
            </div>

            {activeApi === "lipsync" && (
              <div>
                <Label>image <span className="text-red-400 normal-case">required</span></Label>
                <FileDropZone
                  file={lsImage} previewUrl={lsImageUrl} accept="image/*" hint="portrait image"
                  icon={<ImageIcon />}
                  onChange={(f) => { setLsImage(f); setLsImageUrl(URL.createObjectURL(f)); }}
                />
              </div>
            )}

            {activeApi === "img2vid" && (
              <>
                <div>
                  <Label>image <span className="text-red-400 normal-case">required</span></Label>
                  <FileDropZone
                    file={v2Image} previewUrl={v2ImageUrl} accept="image/*" hint="source image"
                    icon={<ImageIcon />}
                    onChange={(f) => { setV2Image(f); setV2ImageUrl(URL.createObjectURL(f)); }}
                  />
                </div>
                <TextInput label="promptText" value={v2Prompt} onChange={setV2Prompt} placeholder="Describe motion or scene…" />
                <div>
                  <Label>resolution</Label>
                  <SegmentControl value={v2Resolution} options={["480p", "720p"]} onChange={setV2Resolution} />
                </div>
                <TextInput label="duration (s)" value={v2Duration} onChange={setV2Duration} placeholder="e.g. 5" type="number" />
              </>
            )}

            {activeApi === "img2vid-audio" && (
              <>
                <div>
                  <Label>image <span className="text-red-400 normal-case">required</span></Label>
                  <FileDropZone
                    file={vaImage} previewUrl={vaImageUrl} accept="image/*" hint="source image"
                    icon={<ImageIcon />}
                    onChange={(f) => { setVaImage(f); setVaImageUrl(URL.createObjectURL(f)); }}
                  />
                </div>
                <TextInput label="promptText" value={vaPrompt} onChange={setVaPrompt} placeholder="Describe motion or scene…" />
                <div>
                  <Label>resolution</Label>
                  <SegmentControl value={vaResolution} options={["480p", "720p"]} onChange={setVaResolution} />
                </div>
                <TextInput label="duration (s)" value={vaDuration} onChange={setVaDuration} placeholder="e.g. 5" type="number" />
              </>
            )}
          </div>

          {/* Run button */}
          <div className="flex-shrink-0 p-4 border-t border-[#222]">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-2.5 rounded-xl text-[15px] font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {status === "polling" ? `Polling… ${pollStatusText}` : "Running…"}
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><path d="M3 2l11 6-11 6V2z" /></svg>
                  Run
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Output + Docs ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Endpoint strip */}
          <div className="flex-shrink-0 border-b border-[#222] px-5 py-2.5 flex items-center gap-2.5">
            <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">POST</span>
            <code className="text-[14px] font-mono text-gray-300">{doc.endpoint.replace("POST ", "")}</code>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Output section */}
            <div className="p-5 border-b border-[#222]">
              <p className="text-[15px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Output</p>

              {status === "idle" && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500 rounded-xl border border-dashed border-[#2a2a2a]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[15px] text-gray-400">Run a request to see output</p>
                </div>
              )}

              {isRunning && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500 rounded-xl border border-dashed border-[#2a2a2a]">
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p className="text-[15px] text-gray-300">
                    {status === "polling"
                      ? <><span className="text-amber-400 font-mono">{pollStatusText}</span> — polling every 3s</>
                      : "Submitting…"}
                  </p>
                </div>
              )}

              {(status === "success" || status === "error") && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[15px] font-mono font-semibold px-2 py-0.5 rounded border ${
                      status === "success"
                        ? "text-green-400 bg-green-400/10 border-green-400/20"
                        : "text-red-400 bg-red-400/10 border-red-400/20"
                    }`}>
                      {httpStatus} {status === "success" ? "OK" : "Error"}
                    </span>
                    {elapsed !== null && <span className="text-[14px] text-gray-400">{elapsed}s</span>}
                  </div>

                  {videoUrl && (
                    <video src={videoUrl} controls autoPlay loop
                      className="w-full max-w-sm rounded-xl bg-black aspect-video" />
                  )}

                  {responseData && (
                    <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 overflow-auto max-h-40 leading-relaxed">
                      {JSON.stringify(responseData, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* API Docs section */}
            <div className="p-5 flex flex-col gap-5">
              <p className="text-[15px] font-semibold text-gray-400 uppercase tracking-wider">API Reference</p>

              {/* Params */}
              <div>
                <p className="text-[15px] text-gray-400 mb-2">Parameters · multipart/form-data</p>
                <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                  {doc.params.map((p, i) => (
                    <div key={p.name} className={`flex items-center gap-3 px-4 py-3 ${i < doc.params.length - 1 ? "border-b border-[#222]" : ""}`}>
                      <code className="text-[14px] font-mono text-white w-28 flex-shrink-0">{p.name}</code>
                      <span className="text-[15px] font-mono text-blue-400 w-14 flex-shrink-0">{p.type}</span>
                      <span className={`text-[14px] font-semibold w-14 flex-shrink-0 ${p.required ? "text-red-400" : "text-gray-500"}`}>
                        {p.required ? "required" : "optional"}
                      </span>
                      <span className="text-[14px] text-gray-300">{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response examples */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[15px] text-gray-400 mb-2"><span className="text-green-400 font-mono">200</span> Success</p>
                  <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 leading-relaxed">{doc.successJson}</pre>
                </div>
                <div>
                  <p className="text-[15px] text-gray-400 mb-2"><span className="text-red-400 font-mono">4xx</span> Error</p>
                  <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 leading-relaxed">{`{\n  "error_code": "INVALID_API_KEY",\n  "message": "..."\n}`}</pre>
                </div>
              </div>

              {/* Polling */}
              {doc.polling && (
                <div>
                  <p className="text-[15px] text-gray-400 mb-2">Status polling</p>
                  <div className="flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                    <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">GET</span>
                    <code className="text-[14px] font-mono text-gray-300">{doc.polling.replace("GET ", "")}</code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {POLL_STATUSES.map((s) => (
                      <div key={s.value} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161616] border border-[#2a2a2a]">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          s.color === "green" ? "bg-green-400" : s.color === "red" ? "bg-red-400" : "bg-amber-400"
                        }`} />
                        <code className="text-[15px] font-mono text-gray-200">{s.value}</code>
                        <span className="text-[15px] text-gray-400">{s.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function PlaygroundPage() {
  return (
    <ProtectedRoute>
      <PlaygroundContent />
    </ProtectedRoute>
  );
}
