"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import AppNavbar from "@/components/AppNavbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Room, RoomEvent, Track } from "livekit-client";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiId = "lipsync" | "img2vid" | "img2vid-audio";
type ApiStatus = "idle" | "loading" | "polling" | "success" | "error";
type SessionPhase = "none" | "creating" | "ready" | "error";

interface VideoResponse {
  video_url?: string;
  videoUrl?: string;
  url?: string;
  video_id?: string;
  id?: string;
  session_id?: string;
  livekit_url?: string;
  livekit_token?: string;
  tts_worker_connected?: boolean;
  video_worker_connected?: boolean;
  status?: string;
  duration?: number;
  error_code?: string;
  message?: string;
  [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_API_KEY = "pika_TvWK2wLZCC7RDzlPdby_CQ-VI2B4d9Lvr6knq8D8tYo";
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
    endpoint: "POST /api/realtime/session",
    params: [
      { name: "image",         type: "file",   required: false, desc: "Portrait image (JPG / PNG, usually required)" },
      { name: "voice_id",      type: "string", required: true,  desc: "Voice ID (required)" },
      { name: "motion_prompt", type: "string", required: false, desc: "Facial motion description" },
      { name: "silent_prompt", type: "string", required: false, desc: "Silent-mode prompt text" },
    ],
    successJson: `{\n  "session_id": "abc123-def456-...",\n  "status": "ready",\n  "timeout": 300\n}`,
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

const LIPSYNC_PRESETS = [
  { id: "char1", src: "/lipsync-presets/char1.jpg", name: "Character 1" },
  { id: "char2", src: "/lipsync-presets/char2.jpg", name: "Character 2" },
  { id: "char3", src: "/lipsync-presets/char3.jpg", name: "Character 3" },
  { id: "char4", src: "/lipsync-presets/char4.jpg", name: "Character 4" },
];

const VIDEO_PROMPT_PRESETS: { tag: string; prompt: string }[] = [
  { tag: "Blow Job", prompt: "A long-haired woman, facing the camera, holding a man's penis, performing a blow job. She slowly takes the entire penis completely into her mouth, fully submerging it until her lips press against the base of the penis and lightly touch the testicles, with the penis fully accommodated in her throat, and repeatedly moves it in and out with a steady, fluid rhythm multiple times. Please ensure the stability of the face and the object, and present more refined details. --blow_job" },
  { tag: "Tits Job", prompt: "The woman, seated or standing, presses a penis firmly between her breasts, using intense contractions and relaxations of her pectoral muscles to drive it up and down with a relentless, rhythmic motion. Each movement is deliberate, the friction of skin against skin amplifying the tactile intensity. Her head tilts back sharply, lips parting in a ragged, primal moan that betrays her overwhelming arousal. Her eyes, clenched shut in a storm of pleasure, flicker open briefly, revealing a wild, desperate glint. The soft light bathes her glistening skin, casting stark shadows that heighten the raw intimacy of the scene. --tits_job" },
  { tag: "Missionary", prompt: "The woman lies on her back in a missionary pose, her legs spread wide as she drives her hips upward with fierce, rhythmic intensity. Each motion is forceful, meeting the man's penetrating thrusts, the penis delving deep into her vagina with relentless precision. Her head tilts back, lips parting in a gasping, primal moan. Her eyes, squeezed shut in overwhelming pleasure, flicker open briefly, revealing a fevered gaze. Her breath comes in ragged bursts, her body trembling in sync with the relentless rhythm. The camera, positioned between her legs, captures the glistening sheen of her skin under soft light. --missionary" },
  { tag: "Side Fuck", prompt: "Standing beside the woman, the man slowly inserts his penis into her vagina, inch by inch, with a calm yet forceful rhythm, each thrust deliberate and probing the depths within. Her body, angled to meet his, quivers with each entry, her hands gripping the surface for support. Her head tilts upward, lips parting in a ragged moan that blends intense pleasure with a hint of strain. Her cheeks burn with a deep, feverish blush, her breath coming in sharp, uneven gasps. The soft light casts a warm glow on her glistening skin, heightening the intimate ferocity of the moment. --side_fuck" },
  { tag: "Pussy", prompt: "The woman gently strokes her vagina with her fingertips, her movements slow yet deliberate, each caress parting the slightly open folds to reveal a glistening, milky fluid that seeps slowly, trailing down her skin. The rhythmic motion of her hand mirrors the pulsing flow, creating a scene of raw tactile intensity. Her head tilts back sharply, lips parting in a gasping, primal moan. Her breath comes in ragged bursts, her lower lip trembling as she bites it fiercely, a strained yet enraptured smile breaking through with each pulsing touch. The soft light bathes her glistening skin, casting stark shadows that amplify the raw intimacy. --pussy" },
  { tag: "Reverse Cowgirl", prompt: "The woman, positioned above the man and facing forward, drives her hips downward with fierce, rhythmic intensity, guiding his penis deep into her vagina with each deliberate thrust. The penetration is forceful, each motion probing the depths within. Her hands clutch a nearby surface or her thighs tightly, her body arching with unrestrained fervor. Her head is tilted slightly back, eyes fixed forward, maintaining a steady gaze ahead. Her hair whips wildly with her movements, catching the soft light that bathes her glistening skin, heightening the primal allure of the scene. --reverse_cowgirl" },
  { tag: "Doggy", prompt: "The man stands behind the woman, extending his penis toward her vagina. As his penis presses against the entrance, he enters with a forceful yet controlled rhythm, each thrust delving deep. The woman, on her hands and knees, arches her back sharply, her mouth opening slightly with each powerful thrust. Her head then turns to face forward, tilted slightly back. The room's dim light casts stark shadows on her glistening skin, amplifying the raw intensity of the moment. --doggy" },
  { tag: "Cowgirl", prompt: "The woman, in a cowgirl position atop the man, facing him, drives her hips downward with fierce, rhythmic intensity, guiding his penis deep into her vagina with each deliberate thrust. Her hands tightly clutch a nearby surface or her thighs, her body arching with unrestrained fervor. Her head tilts back sharply, lips parting in a ragged, primal moan. Her hair whips wildly with her movements, catching the soft light that bathes her glistening skin, heightening the primal allure. --cowgirl" },
  { tag: "Masturbation", prompt: "The woman, reclining or seated, explores her body with slow, deliberate touches, her fingers tracing over her skin before settling on her clitoris with focused, rhythmic strokes. Each movement is intentional, alternating between gentle circles and firmer presses. Her other hand roams, teasing her breasts or inner thighs. Her head tilts back sharply, lips parting in a soft, primal moan. Her breath comes in ragged, uneven gasps, her lower lip trembling as she bites it gently. The soft light bathes her glistening skin, casting stark shadows that heighten the raw, intimate solitude. --masturbation" },
  { tag: "Handjob", prompt: "The woman tightly grasps the man's penis with both hands, moving them slowly up and down, the motion of her fingers clearly visible as they glide deliberately to the tip and descend, delivering a perfect handjob. Her expression is vivid, cheeks flushed with a deep blush, mouth wide open as she gasps heavily, letting out bold moans, her gaze intensely fixed on him before half-closing. Her eyebrows arch with a wicked charm, a sly smirk curling her lips, her breathing rapid, tongue grazing her lips. --handjob" },
  { tag: "Lift Cloth", prompt: "A female lifts her shirt to reveal her breasts. She cups and jiggles them with both hands. Her facial expression is neutral, and her lips are slightly parted. The pose is front view, and the motion level is moderate. The camera is static with a medium shot. The performance is suggestive and moderately paced. --lift_clothes" },
  { tag: "Gloryhole", prompt: "The woman, squatting or kneeling on the ground beside a wall with a small hole, faces the camera with a bold gaze, her hand firmly grasping the man's erection protruding through the opening. She slowly guides the penis into her mouth, her lips enveloping it with deliberate care, sliding it in and out in a steady, repetitive rhythm. Her hair sways gently with the motion, catching the soft light that illuminates her face, accentuating the intensity of her focus. --gloryhole_blowjob" },
  { tag: "Twerking", prompt: "The woman turns her buttocks towards the camera while standing. She is shaking her buttocks vigorously as she dances, twerking rhythmically with her hips swaying side to side." },
];

const POLL_STATUSES = [
  { value: "queued",   color: "amber", desc: "Waiting in queue" },
  { value: "started",  color: "amber", desc: "Generating" },
  { value: "finished", color: "green", desc: "Done — video_url available" },
  { value: "failed",   color: "red",   desc: "Generation failed" },
];

// ─── Progress helpers ─────────────────────────────────────────────────────────

const GENERATION_STEPS = [
  { order: 0, label: "Queued", desc: "Waiting for an available worker", statuses: ["queued", "pending"] },
  { order: 1, label: "Generating", desc: "AI is creating your video", statuses: ["started", "processing", "generating", "running"] },
  { order: 2, label: "Finishing", desc: "Encoding and uploading video", statuses: ["finishing", "encoding", "uploading"] },
  { order: 3, label: "Complete", desc: "Video ready", statuses: ["finished", "completed", "done", "success"] },
];

function getProgressPercent(status: string): number {
  const s = status.toLowerCase();
  if (["queued", "pending"].includes(s)) return 15;
  if (["started", "processing", "generating", "running"].includes(s)) return 55;
  if (["finishing", "encoding", "uploading"].includes(s)) return 85;
  if (["finished", "completed", "done", "success"].includes(s)) return 100;
  return 10;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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

  // Lipsync session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("none");
  const [sessionLog, setSessionLog] = useState<{ role: "system" | "user" | "ai" | "api"; text: string }[]>([]);
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingText, setSendingText] = useState(false);

  // Response
  const [status, setStatus] = useState<ApiStatus>("idle");
  const [responseData, setResponseData] = useState<VideoResponse | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [pollStatusText, setPollStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveKitRoomRef = useRef<Room | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    if (pollStartTime) {
      timerRef.current = setInterval(() => {
        setLiveElapsed(Math.round((Date.now() - pollStartTime) / 1000));
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [pollStartTime]);

  const pollVideoStatus = useCallback(async (videoId: string, startTime: number) => {
    try {
      setPollCount((c) => c + 1);
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
        setPollStartTime(null);
        setStatus("success");
      } else if (FAILED_STATUSES.includes(st)) {
        setElapsed(Math.round((Date.now() - startTime) / 100) / 10);
        setPollStartTime(null);
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
    setPollCount(0);
    setPollStartTime(null);
    setLiveElapsed(0);
  };

  const resetSession = () => {
    if (liveKitRoomRef.current) {
      liveKitRoomRef.current.disconnect();
      liveKitRoomRef.current = null;
    }
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = "";
    }
    setSessionId(null);
    setSessionPhase("none");
    setSessionLog([]);
    setChatHistory([]);
    setChatInput("");
    setSendingText(false);
  };

  const handleCloseSession = async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/playground/lipsync/${sessionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      setSessionLog((prev) => [...prev, { role: "system", text: "Session closed." }]);
    } catch { /* ignore */ }
    resetSession();
    resetResponse();
  };

  const handleSendText = async () => {
    if (!sessionId || !chatInput.trim() || sendingText) return;
    const userText = chatInput.trim();
    setChatInput("");
    setSendingText(true);
    setSessionLog((prev) => [...prev, { role: "user", text: userText }]);

    const newHistory = [...chatHistory, { role: "user", text: userText }];
    setChatHistory(newHistory);

    try {
      // 1. Ask Gemini AI
      const aiRes = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
      });
      const aiData = await aiRes.json();
      const aiText = aiData.text || "...";

      setSessionLog((prev) => [...prev, { role: "ai", text: aiText }]);
      setChatHistory((prev) => [...prev, { role: "model", text: aiText }]);

      // 2. Send AI reply to lipsync
      await fetch(`/api/playground/lipsync/${sessionId}/text`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
    } catch (err) {
      setSessionLog((prev) => [...prev, { role: "ai", text: `Error: ${err}` }]);
    }
    setSendingText(false);
  };

  const handleSubmit = async () => {
    resetResponse();
    setStatus("loading");
    const start = Date.now();

    try {
      if (activeApi === "lipsync") {
        resetSession();
        setSessionPhase("creating");
        setSessionLog([{ role: "system", text: "Creating session… (this may take 30-60s)" }]);

        const fd = new FormData();
        fd.append("image", lsImage!);
        fd.append("voice_id", LIPSYNC_VOICE_ID);
        fd.append("motion_prompt", LIPSYNC_MOTION_PROMPT);
        fd.append("silent_prompt", LIPSYNC_SILENT_PROMPT);

        const res = await fetch("/api/playground/lipsync", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: fd,
        });
        const data: VideoResponse = await res.json();
        setHttpStatus(res.status);
        setResponseData(data);
        setElapsed(Math.round((Date.now() - start) / 100) / 10);

        if (res.ok && data.session_id) {
          setSessionId(data.session_id as string);
          setSessionPhase("ready");
          setSessionLog((prev) => [
            ...prev,
            { role: "api", text: `Session created: ${data.session_id}` },
            { role: "system", text: "Connecting to LiveKit…" },
          ]);
          setStatus("success");

          // Connect to LiveKit for streaming video/audio
          if (data.livekit_url && data.livekit_token) {
            const room = new Room({ adaptiveStream: true, dynacast: true });
            liveKitRoomRef.current = room;

            room.on(RoomEvent.TrackSubscribed, (track) => {
              const el = track.attach();
              if (track.kind === Track.Kind.Video) {
                el.style.width = "100%";
                el.style.height = "auto";
                el.style.display = "block";
                (el as HTMLVideoElement).style.objectFit = "contain";
                videoContainerRef.current?.appendChild(el);
              } else if (track.kind === Track.Kind.Audio) {
                document.body.appendChild(el);
              }
            });

            room.on(RoomEvent.TrackUnsubscribed, (track) => {
              track.detach();
            });

            room.on(RoomEvent.Disconnected, () => {
              setSessionLog((prev) => [...prev, { role: "system", text: "LiveKit disconnected." }]);
            });

            try {
              await room.connect(data.livekit_url as string, data.livekit_token as string);
              setSessionLog((prev) => [
                ...prev,
                { role: "system", text: "LiveKit connected. Type a message to make the character speak." },
              ]);
            } catch (err) {
              setSessionLog((prev) => [...prev, { role: "system", text: `LiveKit connect failed: ${err}` }]);
            }
          } else {
            setSessionLog((prev) => [
              ...prev,
              { role: "system", text: "Session ready. Type a message below to make the character speak." },
            ]);
          }
        } else {
          setSessionPhase("error");
          setSessionLog((prev) => [...prev, { role: "api", text: data.message || `Error ${res.status}` }]);
          setStatus("error");
        }

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
          setPollStartTime(start);
          setPollCount(0);
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
          setPollStartTime(start);
          setPollCount(0);
          pollVideoStatus(videoId as string, start);
        } else {
          setElapsed(Math.round((Date.now() - start) / 100) / 10);
          setStatus("error");
        }
      }
    } catch (err) {
      setResponseData({ message: String(err) });
      setStatus("error");
      if (activeApi === "lipsync") {
        setSessionPhase("error");
        setSessionLog((prev) => [...prev, { role: "api", text: String(err) }]);
      }
    }
  };

  const canSubmit =
    !!apiKey &&
    status !== "loading" &&
    status !== "polling" &&
    (activeApi === "lipsync" ? !!lsImage :
     activeApi === "img2vid" ? !!v2Image : !!vaImage);

  const switchApi = (id: ApiId) => {
    if (sessionId) handleCloseSession();
    resetResponse();
    resetSession();
    setActiveApi(id);
  };
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
              <div className="flex flex-col gap-3">
                <div>
                  <Label>image <span className="text-red-400 normal-case">required</span></Label>
                  <FileDropZone
                    file={lsImage} previewUrl={lsImageUrl} accept="image/*" hint="portrait image"
                    icon={<ImageIcon />}
                    onChange={(f) => { setLsImage(f); setLsImageUrl(URL.createObjectURL(f)); }}
                  />
                </div>
                <div>
                  <p className="text-[13px] text-gray-500 uppercase tracking-wider mb-2">Or pick a character</p>
                  <div className="grid grid-cols-2 gap-2">
                    {LIPSYNC_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={async () => {
                          const res = await fetch(preset.src);
                          const blob = await res.blob();
                          const file = new File([blob], `${preset.id}.jpg`, { type: blob.type });
                          setLsImage(file);
                          setLsImageUrl(preset.src);
                        }}
                        className={`relative rounded-xl overflow-hidden aspect-[3/4] border-2 transition-all hover:scale-[1.03] ${
                          lsImageUrl === preset.src
                            ? "border-white ring-2 ring-white/30"
                            : "border-[#333] hover:border-[#555]"
                        }`}
                        title={preset.name}
                      >
                        <img src={preset.src} alt={preset.name} className="w-full h-full object-cover" />
                        {lsImageUrl === preset.src && (
                          <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
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
                <div>
                  <Label>promptText</Label>
                  <textarea
                    value={v2Prompt}
                    onChange={(e) => setV2Prompt(e.target.value)}
                    placeholder="Describe the motion/animation, or select a preset below…"
                    rows={3}
                    className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#555] font-mono transition-colors resize-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {VIDEO_PROMPT_PRESETS.map((p) => (
                      <button key={p.tag} onClick={() => setV2Prompt(p.prompt)}
                        className={`px-2.5 py-1 rounded-full text-[12px] font-mono font-semibold uppercase tracking-wide transition-colors ${
                          v2Prompt === p.prompt
                            ? "bg-white text-black"
                            : "bg-[#1e1e1e] border border-[#333] text-gray-400 hover:border-[#555] hover:text-white"
                        }`}>
                        {p.tag}
                      </button>
                    ))}
                  </div>
                </div>
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
                <div>
                  <Label>promptText</Label>
                  <textarea
                    value={vaPrompt}
                    onChange={(e) => setVaPrompt(e.target.value)}
                    placeholder="Describe the motion/animation, or select a preset below…"
                    rows={3}
                    className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#555] font-mono transition-colors resize-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {VIDEO_PROMPT_PRESETS.map((p) => (
                      <button key={p.tag} onClick={() => setVaPrompt(p.prompt)}
                        className={`px-2.5 py-1 rounded-full text-[12px] font-mono font-semibold uppercase tracking-wide transition-colors ${
                          vaPrompt === p.prompt
                            ? "bg-white text-black"
                            : "bg-[#1e1e1e] border border-[#333] text-gray-400 hover:border-[#555] hover:text-white"
                        }`}>
                        {p.tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>resolution</Label>
                  <SegmentControl value={vaResolution} options={["480p", "720p"]} onChange={setVaResolution} />
                </div>
                <TextInput label="duration (s)" value={vaDuration} onChange={setVaDuration} placeholder="e.g. 5" type="number" />
              </>
            )}
          </div>

          {/* Run / Close buttons */}
          <div className="flex-shrink-0 p-4 border-t border-[#222] flex flex-col gap-2">
            {activeApi === "lipsync" && sessionPhase === "ready" ? (
              <button
                onClick={handleCloseSession}
                className="w-full py-2.5 rounded-xl text-[15px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Close Session
              </button>
            ) : (
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
                    {status === "polling" ? `Polling… ${pollStatusText}` :
                     activeApi === "lipsync" ? "Creating Session…" : "Running…"}
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><path d="M3 2l11 6-11 6V2z" /></svg>
                    {activeApi === "lipsync" ? "Create Session" : "Run"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: Output + Docs ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Endpoint strip */}
          <div className="flex-shrink-0 border-b border-[#222] px-5 py-2.5 flex items-center gap-2.5 flex-wrap">
            {activeApi === "lipsync" ? (
              <>
                <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">POST</span>
                <code className="text-[14px] font-mono text-gray-300">/api/realtime/session</code>
                {sessionId && (
                  <>
                    <span className="text-gray-600 mx-1">→</span>
                    <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">POST</span>
                    <code className="text-[14px] font-mono text-gray-300">/api/realtime/session/{"{sid}"}/text</code>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">POST</span>
                <code className="text-[14px] font-mono text-gray-300">{doc.endpoint.replace("POST ", "")}</code>
              </>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Output section */}
            <div className="p-5 border-b border-[#222]">
              <p className="text-[15px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {activeApi === "lipsync" ? "Session" : "Output"}
              </p>

              {/* ── Lipsync session UI ── */}
              {activeApi === "lipsync" ? (
                <div className="flex flex-col gap-4">

                  {/* Video container: React overlays + isolated LiveKit div */}
                  <div
                    id="lipsyncVideoContainer"
                    className="w-full rounded-xl bg-black border border-[#2a2a2a] overflow-hidden relative"
                    style={{ maxWidth: "80rem", maxHeight: 620, minHeight: 200 }}
                  >
                    {/* React-managed overlays */}
                    {sessionPhase === "none" && (
                      <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <p className="text-[15px]">Create a session to start</p>
                      </div>
                    )}
                    {sessionPhase === "creating" && (
                      <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <p className="text-[15px]">Creating session… this may take 30-60s</p>
                      </div>
                    )}
                    {sessionPhase === "error" && (
                      <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <p className="text-[15px]">Session creation failed</p>
                      </div>
                    )}
                    {/* LiveKit-only div — React renders nothing inside, safe for imperative DOM ops */}
                    <div
                      ref={videoContainerRef}
                      className="w-full h-full"
                      style={{ display: sessionPhase === "ready" ? "block" : "none" }}
                    />
                  </div>

                  {/* Chat log */}
                  {sessionLog.length > 0 && (
                    <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl max-h-60 overflow-y-auto">
                      {sessionLog.map((msg, i) => (
                        <div key={i} className={`px-4 py-2.5 text-[14px] flex items-start gap-2.5 ${i < sessionLog.length - 1 ? "border-b border-[#222]" : ""}`}>
                          <span className={`flex-shrink-0 text-[11px] font-bold uppercase tracking-wider mt-0.5 w-12 ${
                            msg.role === "system" ? "text-gray-500" :
                            msg.role === "user" ? "text-blue-400" :
                            msg.role === "ai" ? "text-pink-400" : "text-green-400"
                          }`}>{msg.role === "ai" ? "Mia" : msg.role}</span>
                          <span className={`${msg.role === "user" ? "text-white" : "text-gray-300"}`}>{msg.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text input for sending messages */}
                  {sessionPhase === "ready" && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                        placeholder="Type a message for the character to speak…"
                        disabled={sendingText}
                        className="flex-1 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-[#555] transition-colors disabled:opacity-50"
                      />
                      <button
                        onClick={handleSendText}
                        disabled={!chatInput.trim() || sendingText}
                        className="px-5 py-2.5 rounded-xl text-[15px] font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        {sendingText ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                        )}
                        Send
                      </button>
                    </div>
                  )}

                  {/* Response JSON */}
                  {responseData && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[14px] font-mono font-semibold px-2 py-0.5 rounded border ${
                          status === "success"
                            ? "text-green-400 bg-green-400/10 border-green-400/20"
                            : "text-red-400 bg-red-400/10 border-red-400/20"
                        }`}>
                          {httpStatus} {status === "success" ? "OK" : "Error"}
                        </span>
                        {elapsed !== null && <span className="text-[14px] text-gray-400">{elapsed}s</span>}
                      </div>
                      <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 overflow-auto max-h-40 leading-relaxed">
                        {JSON.stringify(responseData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                /* ── img2vid / img2vid-audio output ── */
                <>
                  {status === "idle" && (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500 rounded-xl border border-dashed border-[#2a2a2a]">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-[15px] text-gray-400">Run a request to see output</p>
                    </div>
                  )}

                  {status === "loading" && (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500 rounded-xl border border-dashed border-[#2a2a2a]">
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <p className="text-[15px] text-gray-300">Submitting…</p>
                    </div>
                  )}

                  {status === "polling" && (
                    <div className="rounded-xl border border-[#2a2a2a] bg-[#131313] overflow-hidden">
                      {/* Progress header */}
                      <div className="px-5 py-4 border-b border-[#222] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span className="text-[15px] text-white font-medium">Generating Video</span>
                        </div>
                        <span className="text-[28px] font-mono font-bold text-white tabular-nums">{formatTime(liveElapsed)}</span>
                      </div>

                      {/* Status steps */}
                      <div className="px-5 py-4 flex flex-col gap-3">
                        {GENERATION_STEPS.map((step) => {
                          const isCurrent = step.statuses.includes(pollStatusText);
                          const isDone = step.order < GENERATION_STEPS.find((s) => s.statuses.includes(pollStatusText))?.order!;
                          return (
                            <div key={step.label} className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
                                isDone ? "bg-green-500/20 border-green-500/40" :
                                isCurrent ? "bg-amber-500/20 border-amber-500/40" :
                                "bg-[#1a1a1a] border-[#2a2a2a]"
                              }`}>
                                {isDone ? (
                                  <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : isCurrent ? (
                                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-[#333]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[14px] font-medium ${isDone ? "text-green-400" : isCurrent ? "text-white" : "text-gray-500"}`}>
                                  {step.label}
                                </p>
                                <p className="text-[13px] text-gray-500">{step.desc}</p>
                              </div>
                              {isCurrent && (
                                <span className="text-[12px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">{pollStatusText}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Progress bar */}
                      <div className="px-5 pb-4">
                        <div className="h-1.5 rounded-full bg-[#1e1e1e] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-700 ease-out"
                            style={{ width: `${getProgressPercent(pollStatusText)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-2">
                          <span className="text-[12px] text-gray-500">Poll #{pollCount} · every 3s</span>
                          <span className="text-[12px] text-gray-500">{getProgressPercent(pollStatusText)}%</span>
                        </div>
                      </div>
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
                          className="w-full max-w-3xl rounded-xl bg-black" />
                      )}

                      {responseData && (
                        <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 overflow-auto max-h-40 leading-relaxed">
                          {JSON.stringify(responseData, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* API Docs section */}
            <div className="p-5 flex flex-col gap-5">
              <p className="text-[15px] font-semibold text-gray-400 uppercase tracking-wider">API Reference</p>

              {activeApi === "lipsync" ? (
                /* ── Lipsync session-based docs ── */
                <div className="flex flex-col gap-6">

                  {/* Step 1: Create Session */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[13px] font-bold text-gray-500 bg-[#1e1e1e] rounded-full w-6 h-6 flex items-center justify-center">1</span>
                      <p className="text-[15px] text-white font-medium">Create Session</p>
                    </div>
                    <div className="flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                      <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">POST</span>
                      <code className="text-[14px] font-mono text-gray-300">/api/realtime/session</code>
                    </div>
                    <p className="text-[14px] text-gray-400 mb-2">Parameters · multipart/form-data</p>
                    <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                      {doc.params.map((p, i) => (
                        <div key={p.name} className={`flex items-center gap-3 px-4 py-3 ${i < doc.params.length - 1 ? "border-b border-[#222]" : ""}`}>
                          <code className="text-[14px] font-mono text-white w-28 flex-shrink-0">{p.name}</code>
                          <span className="text-[14px] font-mono text-blue-400 w-14 flex-shrink-0">{p.type}</span>
                          <span className={`text-[14px] font-semibold w-14 flex-shrink-0 ${p.required ? "text-red-400" : "text-gray-500"}`}>
                            {p.required ? "required" : "optional"}
                          </span>
                          <span className="text-[14px] text-gray-300">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[14px] text-gray-400 mt-3 mb-2"><span className="text-green-400 font-mono">200</span> Success</p>
                    <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 leading-relaxed">{doc.successJson}</pre>
                  </div>

                  {/* Step 2: Query Status */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[13px] font-bold text-gray-500 bg-[#1e1e1e] rounded-full w-6 h-6 flex items-center justify-center">2</span>
                      <p className="text-[15px] text-white font-medium">Query Session Status <span className="text-gray-500 text-[13px]">(optional)</span></p>
                    </div>
                    <div className="flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                      <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">GET</span>
                      <code className="text-[14px] font-mono text-gray-300">{"/api/realtime/session/{session_id}"}</code>
                    </div>
                    <p className="text-[14px] text-gray-400">Returns the current session state JSON. Use to wait for the worker node to be ready.</p>
                  </div>

                  {/* Step 3: Send Text */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[13px] font-bold text-gray-500 bg-[#1e1e1e] rounded-full w-6 h-6 flex items-center justify-center">3</span>
                      <p className="text-[15px] text-white font-medium">Send Text</p>
                    </div>
                    <div className="flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                      <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">POST</span>
                      <code className="text-[14px] font-mono text-gray-300">{"/api/realtime/session/{session_id}/text"}</code>
                    </div>
                    <p className="text-[14px] text-gray-400 mb-2">Body · application/json</p>
                    <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <code className="text-[14px] font-mono text-white w-28 flex-shrink-0">text</code>
                        <span className="text-[14px] font-mono text-blue-400 w-14 flex-shrink-0">string</span>
                        <span className="text-[14px] font-semibold text-red-400 w-14 flex-shrink-0">required</span>
                        <span className="text-[14px] text-gray-300">The text for the character to speak</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Close Session */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[13px] font-bold text-gray-500 bg-[#1e1e1e] rounded-full w-6 h-6 flex items-center justify-center">4</span>
                      <p className="text-[15px] text-white font-medium">Close Session</p>
                    </div>
                    <div className="flex items-center gap-2 bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3">
                      <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">DELETE</span>
                      <code className="text-[14px] font-mono text-gray-300">{"/api/realtime/session/{session_id}"}</code>
                    </div>
                    <p className="text-[14px] text-gray-400 mt-3">Releases resources. Always close sessions when done.</p>
                  </div>

                  {/* Error response */}
                  <div>
                    <p className="text-[15px] text-gray-400 mb-2"><span className="text-red-400 font-mono">4xx</span> Error</p>
                    <pre className="bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-[14px] font-mono text-gray-300 leading-relaxed">{`{\n  "error_code": "INVALID_API_KEY",\n  "message": "..."\n}`}</pre>
                  </div>
                </div>
              ) : (
                /* ── img2vid docs (unchanged) ── */
                <>
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
                </>
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
