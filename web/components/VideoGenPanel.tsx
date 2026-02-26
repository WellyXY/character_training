"use client";

import { useState, useRef } from "react";
import type { Image } from "@/lib/types";
import {
  analyzeImageForAnimation,
  animateImage,
  uploadFile,
  resolveApiUrl,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface ReferenceVideo {
  file: File | null;
  url: string | null;
  duration: number | null;
}

interface VideoGenPanelProps {
  characterId: string | null;
  availableImages: Image[];
  preSelectedImage: Image | null;
  onClearPreSelected: () => void;
  onVideoCreated: () => void;
  onTaskStarted?: (task: { task_id: string; prompt: string; reference_image_url?: string }) => void;
}

// Default video prompt presets from Prompt.md
const VIDEO_PROMPT_PRESETS: { tag: string; prompt: string }[] = [
  {
    tag: "Blow Job",
    prompt: "A long-haired woman, facing the camera, holding a man's penis, performing a blow job. She slowly takes the entire penis completely into her mouth, fully submerging it until her lips press against the base of the penis and lightly touch the testicles, with the penis fully accommodated in her throat, and repeatedly moves it in and out with a steady, fluid rhythm multiple times. Please ensure the stability of the face and the object, and present more refined details. --blow_job",
  },
  {
    tag: "Tits Job",
    prompt: "The woman, seated or standing, presses a penis firmly between her breasts, using intense contractions and relaxations of her pectoral muscles to drive it up and down with a relentless, rhythmic motion. Each movement is deliberate, the friction of skin against skin amplifying the tactile intensity. Her head tilts back sharply, lips parting in a ragged, primal moan that betrays her overwhelming arousal. Her eyes, clenched shut in a storm of pleasure, flicker open briefly, revealing a wild, desperate glint. The soft light bathes her glistening skin, casting stark shadows that heighten the raw intimacy of the scene. --tits_job",
  },
  {
    tag: "Missionary",
    prompt: "The woman lies on her back in a missionary pose, her legs spread wide as she drives her hips upward with fierce, rhythmic intensity. Each motion is forceful, meeting the man's penetrating thrusts, the penis delving deep into her vagina with relentless precision. Her head tilts back, lips parting in a gasping, primal moan. Her eyes, squeezed shut in overwhelming pleasure, flicker open briefly, revealing a fevered gaze. Her breath comes in ragged bursts, her body trembling in sync with the relentless rhythm. The camera, positioned between her legs, captures the glistening sheen of her skin under soft light. --missionary",
  },
  {
    tag: "Side Fuck",
    prompt: "Standing beside the woman, the man slowly inserts his penis into her vagina, inch by inch, with a calm yet forceful rhythm, each thrust deliberate and probing the depths within. Her body, angled to meet his, quivers with each entry, her hands gripping the surface for support. Her head tilts upward, lips parting in a ragged moan that blends intense pleasure with a hint of strain. Her cheeks burn with a deep, feverish blush, her breath coming in sharp, uneven gasps. The soft light casts a warm glow on her glistening skin, heightening the intimate ferocity of the moment. --side_fuck",
  },
  {
    tag: "Pussy",
    prompt: "The woman gently strokes her vagina with her fingertips, her movements slow yet deliberate, each caress parting the slightly open folds to reveal a glistening, milky fluid that seeps slowly, trailing down her skin. The rhythmic motion of her hand mirrors the pulsing flow, creating a scene of raw tactile intensity. Her head tilts back sharply, lips parting in a gasping, primal moan. Her breath comes in ragged bursts, her lower lip trembling as she bites it fiercely, a strained yet enraptured smile breaking through with each pulsing touch. The soft light bathes her glistening skin, casting stark shadows that amplify the raw intimacy. --pussy",
  },
  {
    tag: "Reverse Cowgirl",
    prompt: "The woman, positioned above the man and facing forward, drives her hips downward with fierce, rhythmic intensity, guiding his penis deep into her vagina with each deliberate thrust. The penetration is forceful, each motion probing the depths within. Her hands clutch a nearby surface or her thighs tightly, her body arching with unrestrained fervor. Her head is tilted slightly back, eyes fixed forward, maintaining a steady gaze ahead. Her hair whips wildly with her movements, catching the soft light that bathes her glistening skin, heightening the primal allure of the scene. --reverse_cowgirl",
  },
  {
    tag: "Doggy",
    prompt: "The man stands behind the woman, extending his penis toward her vagina. As his penis presses against the entrance, he enters with a forceful yet controlled rhythm, each thrust delving deep. The woman, on her hands and knees, arches her back sharply, her mouth opening slightly with each powerful thrust. Her head then turns to face forward, tilted slightly back. The room's dim light casts stark shadows on her glistening skin, amplifying the raw intensity of the moment. --doggy",
  },
  {
    tag: "Cowgirl",
    prompt: "The woman, in a cowgirl position atop the man, facing him, drives her hips downward with fierce, rhythmic intensity, guiding his penis deep into her vagina with each deliberate thrust. Her hands tightly clutch a nearby surface or her thighs, her body arching with unrestrained fervor. Her head tilts back sharply, lips parting in a ragged, primal moan. Her hair whips wildly with her movements, catching the soft light that bathes her glistening skin, heightening the primal allure. --cowgirl",
  },
  {
    tag: "Masturbation",
    prompt: "The woman, reclining or seated, explores her body with slow, deliberate touches, her fingers tracing over her skin before settling on her clitoris with focused, rhythmic strokes. Each movement is intentional, alternating between gentle circles and firmer presses. Her other hand roams, teasing her breasts or inner thighs. Her head tilts back sharply, lips parting in a soft, primal moan. Her breath comes in ragged, uneven gasps, her lower lip trembling as she bites it gently. The soft light bathes her glistening skin, casting stark shadows that heighten the raw, intimate solitude. --masturbation",
  },
  {
    tag: "Handjob",
    prompt: "The woman tightly grasps the man's penis with both hands, moving them slowly up and down, the motion of her fingers clearly visible as they glide deliberately to the tip and descend, delivering a perfect handjob. Her expression is vivid, cheeks flushed with a deep blush, mouth wide open as she gasps heavily, letting out bold moans, her gaze intensely fixed on him before half-closing. Her eyebrows arch with a wicked charm, a sly smirk curling her lips, her breathing rapid, tongue grazing her lips. --handjob",
  },
  {
    tag: "Lift Cloth",
    prompt: "A female lifts her shirt to reveal her breasts. She cups and jiggles them with both hands. Her facial expression is neutral, and her lips are slightly parted. The pose is front view, and the motion level is moderate. The camera is static with a medium shot. The performance is suggestive and moderately paced. --lift_clothes",
  },
  {
    tag: "Gloryhole",
    prompt: "The woman, squatting or kneeling on the ground beside a wall with a small hole, faces the camera with a bold gaze, her hand firmly grasping the man's erection protruding through the opening. She slowly guides the penis into her mouth, her lips enveloping it with deliberate care, sliding it in and out in a steady, repetitive rhythm. Her hair sways gently with the motion, catching the soft light that illuminates her face, accentuating the intensity of her focus. --gloryhole_blowjob",
  },
  {
    tag: "Twerking",
    prompt: "The woman turns her buttocks towards the camera while standing. She is shaking her buttocks vigorously as she dances, twerking rhythmically with her hips swaying side to side.",
  },
];

const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
};

export default function VideoGenPanel({
  characterId,
  availableImages,
  preSelectedImage,
  onClearPreSelected,
  onVideoCreated,
  onTaskStarted,
}: VideoGenPanelProps) {
  const { refreshUser } = useAuth();
  const [selectedImage, setSelectedImage] = useState<Image | null>(preSelectedImage);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [referenceVideo, setReferenceVideo] = useState<ReferenceVideo | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoModel, setVideoModel] = useState<"v1" | "v2">("v1");
  const [addSubtitles, setAddSubtitles] = useState(false);
  const [matchReferencePose, setMatchReferencePose] = useState(false);
  const [duration, setDuration] = useState<number>(5);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Sync pre-selected image from parent
  if (preSelectedImage && preSelectedImage.id !== selectedImage?.id) {
    setSelectedImage(preSelectedImage);
  }

  const completedImages = availableImages.filter(
    (img) => img.status !== "generating" && img.image_url
  );

  const handleSelectImage = (img: Image) => {
    setSelectedImage(img);
    setPrompt("");
    setError(null);
    onClearPreSelected();
  };

  const handleChangeImage = () => {
    setSelectedImage(null);
    setPrompt("");
    setError(null);
    onClearPreSelected();
  };

  const handleAiSuggestion = async () => {
    if (!selectedImage?.image_url) return;
    setSuggesting(true);
    setError(null);
    try {
      const result = await analyzeImageForAnimation({
        image_id: selectedImage.id,
        image_url: selectedImage.image_url,
      });
      setPrompt(result.suggested_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze image");
    } finally {
      setSuggesting(false);
    }
  };

  const handleVideoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file");
      return;
    }
    setUploadingVideo(true);
    setError(null);
    try {
      const duration = await getVideoDuration(file);
      const uploadResult = await uploadFile(file);
      setReferenceVideo({ file, url: uploadResult.url, duration });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload video");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedImage?.image_url || !characterId) return;

    // Notify parent of the task and start generating
    if (onTaskStarted) {
      const taskId = `animate-${Date.now()}`;
      onTaskStarted({
        task_id: taskId,
        prompt: prompt.trim(),
        reference_image_url: selectedImage.image_url,
      });
    }

    setGenerating(true);
    setError(null);

    const effectiveModel = referenceVideo ? "v1" : videoModel;
    const imgW = selectedImage.metadata?.width;
    const imgH = selectedImage.metadata?.height;
    let aspectRatio: string | undefined;
    if (imgW && imgH) {
      const ratio = imgW / imgH;
      if (ratio < 0.7) aspectRatio = "9:16";
      else if (ratio > 1.4) aspectRatio = "16:9";
      else aspectRatio = "1:1";
    }

    try {
      const result = await animateImage({
        image_id: selectedImage.id,
        image_url: selectedImage.image_url,
        character_id: characterId,
        prompt: prompt.trim(),
        reference_video_url: referenceVideo?.url ?? undefined,
        reference_video_duration: referenceVideo?.duration ?? undefined,
        video_model: effectiveModel,
        add_subtitles: addSubtitles,
        aspect_ratio: aspectRatio,
        duration,
      });

      if (result.success) {
        onVideoCreated();
        refreshUser();
        // Reset form
        setPrompt("");
        setReferenceVideo(null);
      } else {
        setError(result.message);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Insufficient tokens. Please contact your administrator.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to start video generation");
      }
      refreshUser();
    } finally {
      setGenerating(false);
    }
  };

  // Phase 1: Image selection
  if (!selectedImage) {
    return (
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[#333] bg-[#111] p-4 overflow-hidden">
        <div className="mb-3">
          <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Select Source Image</p>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">Choose an image to animate into a video</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {completedImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {completedImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handleSelectImage(img)}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border-2 border-transparent hover:border-white/40 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(img.image_url!)}
                    alt="Select"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <span className="text-white text-xs font-mono font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                      Select
                    </span>
                  </div>
                  <div className="absolute top-1 left-1">
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] text-white backdrop-blur-sm font-mono uppercase ${
                      img.type === "base" ? "bg-green-500/50" : "bg-white/20"
                    }`}>
                      {img.type === "base" ? "Base" : "Content"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-500 font-mono">No images available</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Phase 2: Video controls
  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[#333] bg-[#111] p-4 overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Source Image Preview */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveApiUrl(selectedImage.image_url!)}
              alt="Source"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-mono truncate">{selectedImage.id.slice(0, 8)}</p>
            <button
              type="button"
              onClick={handleChangeImage}
              className="text-[10px] text-gray-400 hover:text-white font-mono uppercase tracking-wide transition-colors"
            >
              Change Image
            </button>
          </div>
        </div>

        {/* Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Video Prompt</p>
            <button
              onClick={handleAiSuggestion}
              disabled={suggesting}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 border border-purple-500/30"
            >
              {suggesting ? (
                <>
                  <div className="w-2.5 h-2.5 border-[1.5px] border-purple-300 border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Suggest
                </>
              )}
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the motion/animation, or select a preset below..."
            rows={3}
            className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 resize-none font-mono"
          />

          {/* Prompt Preset Tags */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {VIDEO_PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.tag}
                type="button"
                onClick={() => setPrompt(preset.prompt)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide transition-colors border ${
                  prompt === preset.prompt
                    ? "bg-white text-black border-white"
                    : "bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/30"
                }`}
              >
                {preset.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-xs text-red-300 font-mono">{error}</p>
          </div>
        )}

        {/* Video Model */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Video Model</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setVideoModel("v1"); setDuration(5); }}
              disabled={!!referenceVideo}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                (referenceVideo ? "v1" : videoModel) === "v1"
                  ? "bg-white text-black"
                  : "bg-white/10 text-gray-400 hover:text-white"
              } ${referenceVideo ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              V1
            </button>
            <button
              onClick={() => { setVideoModel("v2"); setDuration(8); }}
              disabled={!!referenceVideo}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                (referenceVideo ? "v1" : videoModel) === "v2"
                  ? "bg-white text-black"
                  : "bg-white/10 text-gray-400 hover:text-white"
              } ${referenceVideo ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              V2
            </button>
          </div>
          {referenceVideo && (
            <p className="text-[10px] text-gray-500 font-mono mt-1">V2 unavailable with reference video</p>
          )}
          {videoModel === "v2" && !referenceVideo && (
            <p className="text-[10px] text-yellow-500/80 font-mono mt-1">V2 output is landscape (1920x1080) only</p>
          )}
        </div>

        {/* Duration */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Duration</p>
          <div className="flex gap-2">
            {(videoModel === "v2" && !referenceVideo
              ? [{ value: 6, label: "6s" }, { value: 8, label: "8s" }, { value: 10, label: "10s" }]
              : [{ value: 5, label: "5s" }, { value: 10, label: "10s" }, { value: 15, label: "15s" }]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  duration === opt.value
                    ? "bg-white text-black"
                    : "bg-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitle Toggle */}
        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
          <input
            type="checkbox"
            checked={addSubtitles}
            onChange={(e) => setAddSubtitles(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-transparent text-white focus:ring-white focus:ring-offset-0"
          />
          <div className="flex-1">
            <span className="text-xs text-white font-mono">Add Subtitles</span>
            <p className="text-[10px] text-gray-500 font-mono">Auto-generate captions using AI</p>
          </div>
        </label>

        {/* Reference Video */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Reference Video</p>
            {referenceVideo && (
              <button
                type="button"
                onClick={() => setReferenceVideo(null)}
                className="text-[10px] text-gray-500 hover:text-red-400 font-mono uppercase"
              >
                Remove
              </button>
            )}
          </div>
          {referenceVideo ? (
            <div className="p-2 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs text-white font-mono">Video uploaded</span>
                {referenceVideo.duration && (
                  <span className="text-[10px] text-gray-500 font-mono">{referenceVideo.duration.toFixed(1)}s</span>
                )}
              </div>
              {/* Match Pose Toggle */}
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchReferencePose}
                  onChange={(e) => setMatchReferencePose(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-600 bg-transparent text-white focus:ring-white focus:ring-offset-0"
                />
                <span className="text-[10px] text-gray-400 font-mono">Match reference pose</span>
              </label>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingVideo}
              className="w-full py-2 rounded-lg bg-white/5 border border-dashed border-white/10 text-xs font-mono text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
            >
              {uploadingVideo ? "Uploading..." : "+ Upload Reference Video"}
            </button>
          )}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => handleVideoUpload(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex-shrink-0 pt-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !characterId}
          className="w-full py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {generating ? "Generating..." : "Generate Video"}
        </button>
      </div>
    </section>
  );
}
