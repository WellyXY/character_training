"use client";

import { useRef, useState, useCallback } from "react";
import AppNavbar from "@/components/AppNavbar";
import ProtectedRoute from "@/components/ProtectedRoute";

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

const APIS: { id: ApiId; label: string; endpoint: string; method: string }[] = [
  {
    id: "lipsync",
    label: "Streaming Lipsync",
    endpoint: "POST https://candy-api.pika.art/test/api/v1/realtime/session",
    method: "POST",
  },
  {
    id: "img2vid",
    label: "Image to Video",
    endpoint: "POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2",
    method: "POST",
  },
  {
    id: "img2vid-audio",
    label: "Image to Video + Audio",
    endpoint: "POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio",
    method: "POST",
  },
];

const POLL_INTERVAL = 3000;
const FINISHED_STATUSES = ["finished", "completed", "done", "success"];
const FAILED_STATUSES = ["failed", "error"];

function ImageUpload({
  file,
  previewUrl,
  onChange,
  label = "image",
  required = true,
}: {
  file: File | null;
  previewUrl: string | null;
  onChange: (f: File | null) => void;
  label?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-[13px] font-medium text-gray-400 block mb-1.5">
        <span className="font-mono">{label}</span>{" "}
        {required && <span className="text-red-400">*</span>}
      </label>
      <div
        onClick={() => ref.current?.click()}
        onDrop={(e) => { e.preventDefault(); onChange(e.dataTransfer.files[0] ?? null); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-[#333] rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-[#555] transition-colors"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-[#0a0a0a] border border-[#222] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13px] text-gray-300 truncate">
            {file ? file.name : "Click or drop image"}
          </span>
          <span className="text-[12px] text-gray-600">
            {file ? `${(file.size / 1024).toFixed(0)} KB` : "JPEG / PNG / WebP"}
          </span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function AudioUpload({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-[13px] font-medium text-gray-400 block mb-1.5">
        <span className="font-mono">audio</span>
      </label>
      <div
        onClick={() => ref.current?.click()}
        onDrop={(e) => { e.preventDefault(); onChange(e.dataTransfer.files[0] ?? null); }}
        onDragOver={(e) => e.preventDefault()}
        className="border border-dashed border-[#333] rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-[#555] transition-colors"
      >
        <div className="w-16 h-16 rounded-lg bg-[#0a0a0a] border border-[#222] flex items-center justify-center flex-shrink-0 flex-shrink-0">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13px] text-gray-300 truncate">
            {file ? file.name : "Click or drop audio"}
          </span>
          <span className="text-[12px] text-gray-600">
            {file ? `${(file.size / 1024).toFixed(0)} KB` : "MP3 / WAV / AAC"}
          </span>
        </div>
      </div>
      <input ref={ref} type="file" accept="audio/*" className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function PlaygroundContent() {
  const [activeApi, setActiveApi] = useState<ApiId>("lipsync");
  const [apiKey, setApiKey] = useState("pika_od5V2jd_vAjF8Ts5h6eIytl9FCyVK2XTv6MRk6qQC9E");

  // Lipsync fields
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const LIPSYNC_VOICE_ID = "sample_by_welly";
  const LIPSYNC_MOTION_PROMPT = "A young person is facing towards the camera while speaking. Their facial expression is emotional and expressive. Their head and body shows little natural movement. The camera maintains focus on their face and upper torso, capturing the emotion and grace of their performance in a static, intimate close-up. Their eyes are expressive, conveying the emotion as their poised presence fills the frame with an engaging energy. Camera Motion: Handheld camera, natural camera motion.";
  const LIPSYNC_SILENT_PROMPT = "A young person is facing the camera silently, blinking naturally while keeping their mouth still.";

  // img2vid fields
  const [vidImageFile, setVidImageFile] = useState<File | null>(null);
  const [vidImagePreviewUrl, setVidImagePreviewUrl] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState("");

  // img2vid-audio fields
  const [audImageFile, setAudImageFile] = useState<File | null>(null);
  const [audImagePreviewUrl, setAudImagePreviewUrl] = useState<string | null>(null);
  const [audPromptText, setAudPromptText] = useState("");
  const [audResolution, setAudResolution] = useState("720p");
  const [audDuration, setAudDuration] = useState("");

  // Response state
  const [status, setStatus] = useState<ApiStatus>("idle");
  const [responseData, setResponseData] = useState<VideoResponse | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [pollStatusText, setPollStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  };

  const handleImageChange = (file: File | null, setter: (f: File | null) => void, previewSetter: (u: string | null) => void) => {
    if (!file) return;
    setter(file);
    previewSetter(URL.createObjectURL(file));
  };

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

  const handleSubmit = async () => {
    stopPolling();
    setStatus("loading");
    setResponseData(null);
    setHttpStatus(null);
    setElapsed(null);
    setVideoUrl(null);
    setPollStatusText("");

    const start = Date.now();

    try {
      if (activeApi === "lipsync") {
        const formData = new FormData();
        formData.append("image", imageFile!);
        formData.append("voice_id", LIPSYNC_VOICE_ID);
        formData.append("motion_prompt", LIPSYNC_MOTION_PROMPT);
        formData.append("silent_prompt", LIPSYNC_SILENT_PROMPT);

        const res = await fetch("/api/playground/lipsync", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: formData,
        });
        const data: VideoResponse = await res.json();
        setHttpStatus(res.status);
        setResponseData(data);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);
        const url = data.video_url || data.videoUrl || data.url;
        if (url) setVideoUrl(url as string);
        setStatus(res.ok ? "success" : "error");

      } else if (activeApi === "img2vid") {
        const formData = new FormData();
        formData.append("image", vidImageFile!);
        if (promptText) formData.append("promptText", promptText);
        formData.append("resolution", resolution);
        if (duration) formData.append("duration", duration);

        const res = await fetch("/api/playground/img2vid", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: formData,
        });
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
        const formData = new FormData();
        formData.append("image", audImageFile!);
        if (audPromptText) formData.append("promptText", audPromptText);
        formData.append("resolution", audResolution);
        if (audDuration) formData.append("duration", audDuration);

        const res = await fetch("/api/playground/img2vid-audio", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: formData,
        });
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
    (activeApi === "lipsync" ? !!imageFile :
     activeApi === "img2vid" ? !!vidImageFile :
     !!audImageFile);

  const switchApi = (id: ApiId) => {
    stopPolling();
    setActiveApi(id);
    setStatus("idle");
    setResponseData(null);
    setHttpStatus(null);
    setElapsed(null);
    setVideoUrl(null);
    setPollStatusText("");
  };

  const currentApi = APIS.find((a) => a.id === activeApi)!;

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-gray-200 flex flex-col">
      <AppNavbar />

      <div className="flex flex-col flex-1 min-h-0 pt-[52px]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">API Playground</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Interactively test Pika APIs</p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 2l11 6-11 6V2z" />
            </svg>
            Execute
          </button>
        </div>

        {/* Sidebar + Main */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* LEFT: API Tabs */}
          <div className="flex-shrink-0 w-56 border-r border-[#1e1e1e] flex flex-col gap-1.5 p-3 overflow-y-auto">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider px-2 mb-1">APIs</p>
            {APIS.map((api) => (
              <button
                key={api.id}
                onClick={() => switchApi(api.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  activeApi === api.id
                    ? "bg-white text-black"
                    : "text-gray-400 bg-[#141414] border border-[#252525] hover:bg-[#1c1c1c] hover:text-white"
                }`}
              >
                {api.label}
              </button>
            ))}
          </div>

          {/* RIGHT: Request + Docs + Response */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">

            {/* Endpoint badge */}
            <div className="flex-shrink-0 bg-[#0a0a0a] border border-[#222] rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase px-2.5 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0">
                POST
              </span>
              <code className="text-[13px] font-mono text-gray-400 break-all">{currentApi.endpoint.replace("POST ", "")}</code>
            </div>

            {/* Request + Result */}
            <div className="border border-[#1e1e1e] rounded-xl flex flex-shrink-0">

              {/* LEFT: Input */}
              <div className="w-1/2 p-6 flex flex-col gap-4 bg-[#111] rounded-l-xl">
                <h3 className="text-[14px] font-semibold text-white">Request</h3>

                {/* API Key (shared) */}
                <div>
                  <label className="text-[13px] font-medium text-gray-400 block mb-1.5">
                    X-API-Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#444] font-mono transition-colors"
                  />
                </div>

                {/* ── Lipsync fields ── */}
                {activeApi === "lipsync" && (
                  <ImageUpload
                    file={imageFile}
                    previewUrl={imagePreviewUrl}
                    onChange={(f) => handleImageChange(f, setImageFile, setImagePreviewUrl)}
                  />
                )}

                {/* ── Image to Video fields ── */}
                {activeApi === "img2vid" && (
                  <>
                    <ImageUpload
                      file={vidImageFile}
                      previewUrl={vidImagePreviewUrl}
                      onChange={(f) => handleImageChange(f, setVidImageFile, setVidImagePreviewUrl)}
                    />
                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">promptText</label>
                      <input type="text" placeholder="Describe the motion or scene..." value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#444] font-mono transition-colors" />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">resolution</label>
                      <div className="flex gap-2">
                        {["480p", "720p"].map((r) => (
                          <button key={r} onClick={() => setResolution(r)}
                            className={`flex-1 py-2 rounded-lg text-[13px] font-mono font-medium border transition-colors ${
                              resolution === r
                                ? "bg-white text-black border-white"
                                : "bg-[#0a0a0a] text-gray-400 border-[#2a2a2a] hover:border-[#444]"
                            }`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">duration <span className="text-gray-600 normal-case">(optional)</span></label>
                      <input type="number" min="1" step="1" placeholder="e.g. 5" value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#444] font-mono transition-colors" />
                    </div>
                  </>
                )}

                {/* ── Image to Video + Audio fields ── */}
                {activeApi === "img2vid-audio" && (
                  <>
                    <ImageUpload
                      file={audImageFile}
                      previewUrl={audImagePreviewUrl}
                      onChange={(f) => handleImageChange(f, setAudImageFile, setAudImagePreviewUrl)}
                    />

                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">promptText</label>
                      <input type="text" placeholder="Describe the motion or scene..." value={audPromptText}
                        onChange={(e) => setAudPromptText(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#444] font-mono transition-colors" />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">resolution</label>
                      <div className="flex gap-2">
                        {["480p", "720p"].map((r) => (
                          <button key={r} onClick={() => setAudResolution(r)}
                            className={`flex-1 py-2 rounded-lg text-[13px] font-mono font-medium border transition-colors ${
                              audResolution === r
                                ? "bg-white text-black border-white"
                                : "bg-[#0a0a0a] text-gray-400 border-[#2a2a2a] hover:border-[#444]"
                            }`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-gray-400 block mb-1.5 font-mono">duration <span className="text-gray-600 normal-case">(optional)</span></label>
                      <input type="number" min="1" step="1" placeholder="e.g. 5" value={audDuration}
                        onChange={(e) => setAudDuration(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#444] font-mono transition-colors" />
                    </div>
                  </>
                )}

                {/* Execute button */}
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {status === "loading" || status === "polling" ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      {status === "polling" ? `Polling… ${pollStatusText}` : "Executing…"}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M3 2l11 6-11 6V2z" />
                      </svg>
                      Execute
                    </>
                  )}
                </button>
              </div>

              {/* RIGHT: Result */}
              <div className="w-1/2 p-6 flex flex-col gap-4 bg-[#0a0a0a] rounded-r-xl border-l border-[#1e1e1e]">
                <h3 className="text-[14px] font-semibold text-white">Response</h3>

                {status === "idle" && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600 py-16">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-[13px] text-center">Execute a request to see<br />the generated video here</p>
                  </div>
                )}

                {(status === "loading" || status === "polling") && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 py-16">
                    <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <p className="text-[13px]">
                      {status === "polling"
                        ? <>Generating video… <span className="font-mono text-amber-400">{pollStatusText}</span></>
                        : "Submitting request…"}
                    </p>
                  </div>
                )}

                {(status === "success" || status === "error") && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-[12px] font-mono font-medium border ${
                        status === "success"
                          ? "text-green-400 bg-green-400/10 border-green-400/20"
                          : "text-red-400 bg-red-400/10 border-red-400/20"
                      }`}>
                        {httpStatus ?? "—"} {status === "success" ? "OK" : "Error"}
                      </span>
                      {elapsed !== null && (
                        <span className="text-[13px] text-gray-500">{elapsed}s</span>
                      )}
                    </div>

                    {videoUrl && (
                      <video src={videoUrl} controls autoPlay loop
                        className="w-full rounded-lg aspect-video bg-black" />
                    )}

                    {responseData && (
                      <div>
                        <p className="text-[12px] font-medium text-gray-400 mb-2">Response Body</p>
                        <pre className="bg-[#080808] border border-[#1a1a1a] rounded-lg p-4 text-[13px] font-mono text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap break-all leading-relaxed">
                          {JSON.stringify(responseData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Docs per API */}
            <ApiDocs apiId={activeApi} />

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── API doc configs ────────────────────────────────────────────────────────

const API_DOCS = {
  lipsync: {
    title: "Streaming Lipsync",
    endpoint: { method: "POST", url: "https://candy-api.pika.art/test/api/v1/realtime/session" },
    note: "Synchronous — connection stays open until video is ready.",
    params: [
      { name: "image", type: "file", required: true, desc: "Portrait image (JPEG / PNG / WebP)" },
      { name: "voice_id", type: "string", required: false, desc: "TTS voice ID" },
      { name: "motion_prompt", type: "string", required: false, desc: "Facial motion description" },
      { name: "silent_prompt", type: "string", required: false, desc: "Lipsync text without audio" },
    ],
    successJson: `{\n  "video_url": "https://cdn.pika.art/outputs/abc.mp4",\n  "duration": 3.5\n}`,
    polling: null,
  },
  img2vid: {
    title: "Image to Video v2",
    endpoint: { method: "POST", url: "https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2" },
    note: "Async — returns video_id immediately, poll for result.",
    params: [
      { name: "image", type: "file", required: true, desc: "Source image (JPEG / PNG / WebP)" },
      { name: "promptText", type: "string", required: false, desc: "Motion or scene description" },
      { name: "resolution", type: "string", required: false, desc: "480p or 720p" },
      { name: "duration", type: "number", required: false, desc: "Duration in seconds" },
    ],
    successJson: `{\n  "video_id": "550e8400-e29b-41d4-a716-446655440000"\n}`,
    polling: "https://parrot.pika.art/api/v1/generate/v0/videos/{video_id}",
  },
  "img2vid-audio": {
    title: "Image to Video v2 + Audio",
    endpoint: { method: "POST", url: "https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio" },
    note: "Async — returns video_id immediately, poll for result.",
    params: [
      { name: "image", type: "file", required: true, desc: "Source image (JPEG / PNG / WebP)" },
      { name: "audio", type: "file", required: false, desc: "Audio file (MP3 / WAV / AAC)" },
      { name: "promptText", type: "string", required: false, desc: "Motion or scene description" },
      { name: "resolution", type: "string", required: false, desc: "480p or 720p" },
      { name: "duration", type: "number", required: false, desc: "Duration in seconds" },
    ],
    successJson: `{\n  "video_id": "550e8400-e29b-41d4-a716-446655440000"\n}`,
    polling: "https://parrot.pika.art/api/v1/generate/v0/videos/{video_id}",
  },
} as const;

const POLL_STATUSES = [
  { value: "queued", color: "amber", desc: "Waiting in queue" },
  { value: "started", color: "amber", desc: "Generating" },
  { value: "finished", color: "green", desc: "Done — video_url available" },
  { value: "failed", color: "red", desc: "Generation failed" },
];

function ApiDocs({ apiId }: { apiId: ApiId }) {
  const doc = API_DOCS[apiId];

  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl overflow-hidden">
      {/* Title bar */}
      <div className="px-5 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-white">{doc.title}</span>
        <span className="text-[11px] text-gray-500 font-mono">{doc.note}</span>
      </div>

      <div className="p-5 flex flex-col gap-5">

        {/* Endpoint */}
        <div className="flex items-center gap-2 bg-[#080808] border border-[#1a1a1a] rounded-lg px-3.5 py-2.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0">{doc.endpoint.method}</span>
          <code className="text-[12px] font-mono text-gray-400 break-all">{doc.endpoint.url}</code>
        </div>

        {/* Params */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Parameters</p>
          <div className="flex flex-col gap-1">
            {doc.params.map((p) => (
              <div key={p.name} className="flex items-baseline gap-3 px-3 py-2 rounded-lg bg-[#080808] border border-[#1a1a1a]">
                <code className="text-[12px] font-mono text-white flex-shrink-0 w-28">{p.name}</code>
                <span className="text-[11px] font-mono text-blue-400 flex-shrink-0 w-12">{p.type}</span>
                {p.required
                  ? <span className="text-[10px] font-bold text-red-400 flex-shrink-0">required</span>
                  : <span className="text-[10px] text-gray-600 flex-shrink-0">optional</span>}
                <span className="text-[12px] text-gray-500">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Auth */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Auth Header</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#080808] border border-[#1a1a1a]">
            <span className="text-[12px] font-mono text-purple-300">X-API-KEY</span>
            <span className="text-gray-600">:</span>
            <span className="text-[12px] font-mono text-yellow-200/70">pk_xxxxxxxxxxxxxxxx</span>
          </div>
        </div>

        {/* Response */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              <span className="text-green-400">200</span> Success
            </p>
            <pre className="bg-[#080808] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-[12px] font-mono text-gray-300 leading-relaxed">{doc.successJson}</pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              <span className="text-red-400">4xx</span> Error
            </p>
            <pre className="bg-[#080808] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-[12px] font-mono text-gray-300 leading-relaxed">{`{\n  "error_code": "INVALID_API_KEY",\n  "message": "..."\n}`}</pre>
          </div>
        </div>

        {/* Polling (only for async APIs) */}
        {doc.polling && (
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Status Polling</p>
            <div className="flex items-center gap-2 bg-[#080808] border border-[#1a1a1a] rounded-lg px-3.5 py-2.5 mb-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">GET</span>
              <code className="text-[12px] font-mono text-gray-400">{doc.polling}</code>
            </div>
            <div className="flex gap-2 flex-wrap">
              {POLL_STATUSES.map((s) => (
                <div key={s.value} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#080808] border border-[#1a1a1a]">
                  <code className={`text-[11px] font-mono font-bold ${
                    s.color === "green" ? "text-green-400" : s.color === "red" ? "text-red-400" : "text-amber-400"
                  }`}>{s.value}</code>
                  <span className="text-[11px] text-gray-500">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <ProtectedRoute>
      <PlaygroundContent />
    </ProtectedRoute>
  );
}
