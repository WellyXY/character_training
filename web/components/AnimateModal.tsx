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

interface AnimateModalProps {
  image: Image;
  characterId: string;
  onClose: () => void;
  onVideoCreated: () => void;
  onTaskStarted?: (task: { task_id: string; prompt: string; reference_image_url?: string }) => void;
  initialReferenceVideo?: { url: string; duration: number } | null;
  initialReferenceVideoLoading?: boolean;
}

// Get video duration from file
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

export default function AnimateModal({
  image,
  characterId,
  onClose,
  onVideoCreated,
  onTaskStarted,
  initialReferenceVideo,
  initialReferenceVideoLoading = false,
}: AnimateModalProps) {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [referenceVideo, setReferenceVideo] = useState<ReferenceVideo | null>(
    initialReferenceVideo
      ? { file: null, url: initialReferenceVideo.url, duration: initialReferenceVideo.duration }
      : null
  );
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videoModel, setVideoModel] = useState<"v1" | "v2">("v1");
  const [addSubtitles, setAddSubtitles] = useState(false);
  const [matchReferencePose, setMatchReferencePose] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // AI Suggestion - analyze image on demand
  const handleAiSuggestion = async () => {
    if (!image.image_url) {
      setError("Image URL not available");
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const result = await analyzeImageForAnimation({
        image_id: image.id,
        image_url: image.image_url,
      });
      setPrompt(result.suggested_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze image");
    } finally {
      setSuggesting(false);
    }
  };

  // Handle video file upload
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
      // Get video duration
      const duration = await getVideoDuration(file);

      // Upload the file
      const uploadResult = await uploadFile(file);

      setReferenceVideo({
        file,
        url: uploadResult.url,
        duration,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload video");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    }
  };

  const handleRemoveVideo = () => {
    setReferenceVideo(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleVideoUpload(e.dataTransfer.files);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    if (!image.image_url) {
      setError("Image URL not available");
      return;
    }

    // Notify parent of the task and close modal immediately
    if (onTaskStarted) {
      const taskId = `animate-${Date.now()}`;
      onTaskStarted({
        task_id: taskId,
        prompt: prompt.trim(),
        reference_image_url: image.image_url,
      });
    }

    // Close modal immediately
    onClose();

    // Fire API call in background (continues after unmount)
    // Force V1 when reference video is present (V2 doesn't support Addition API)
    const effectiveModel = referenceVideo ? "v1" : videoModel;
    // Detect image aspect ratio from metadata
    const imgW = image.metadata?.width;
    const imgH = image.metadata?.height;
    let aspectRatio: string | undefined;
    if (imgW && imgH) {
      const ratio = imgW / imgH;
      if (ratio < 0.7) aspectRatio = "9:16";
      else if (ratio > 1.4) aspectRatio = "16:9";
      else aspectRatio = "1:1";
    }

    const requestData = {
      image_id: image.id,
      image_url: image.image_url,
      character_id: characterId,
      prompt: prompt.trim(),
      reference_video_url: referenceVideo?.url ?? undefined,
      reference_video_duration: referenceVideo?.duration ?? undefined,
      video_model: effectiveModel,
      add_subtitles: addSubtitles,
      match_reference_pose: referenceVideo ? matchReferencePose : false,
      aspect_ratio: aspectRatio,
    };
    console.log("=== AnimateModal Request ===");
    console.log("Request data:", requestData);
    console.log("Reference video:", referenceVideo);
    console.log("============================");

    try {
      const result = await animateImage(requestData);
      console.log("AnimateModal response:", result);

      if (result.success) {
        // Video generation started - close modal and refresh to show processing status
        onVideoCreated();
        onClose();
        refreshUser(); // Refresh token balance
      } else {
        console.error("Video generation failed:", result.message);
        alert(result.message);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        alert("Insufficient tokens. Please contact your administrator.");
      } else {
        console.error("Video generation failed:", err);
        alert(`Failed to start video generation: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
      refreshUser(); // Refresh in case balance changed
    }
  };

  const handleMotionTagClick = (motionType: string) => {
    setPrompt((prev) => {
      if (prev.toLowerCase().includes(motionType.toLowerCase())) {
        return prev;
      }
      return prev ? `${prev}, ${motionType}` : motionType;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-2xl border border-[#333] max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-semibold font-mono">Make Video</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content - two column layout */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="flex gap-4">
            {/* Left: Selected Image Preview */}
            <div className="w-56 flex-shrink-0">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
                <img
                  src={resolveApiUrl(image.image_url!)}
                  alt="Selected image"
                  className="w-full h-auto object-cover"
                />
              </div>
              <p className="text-xs text-gray-500 font-mono mt-2 text-center truncate">
                {image.id.slice(0, 8)}
              </p>
            </div>

            {/* Right: Controls */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Prompt Input */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Video Prompt</p>
                  <button
                    onClick={handleAiSuggestion}
                    disabled={suggesting}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/30"
                  >
                    {suggesting ? (
                      <>
                        <div className="w-3 h-3 border-[1.5px] border-purple-300 border-t-transparent rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI Suggestion
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the motion/animation, or click AI Suggestion..."
                  rows={4}
                  className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 resize-none font-mono"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-300 font-mono">{error}</p>
                </div>
              )}

              {/* Options */}
              <div className="space-y-2 mb-4">
                {/* Video Model Toggle */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Video Model</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVideoModel("v1")}
                      disabled={!!referenceVideo}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                        (referenceVideo ? "v1" : videoModel) === "v1"
                          ? "bg-white text-black"
                          : "bg-white/10 text-gray-400 hover:text-white"
                      } ${referenceVideo ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      V1
                    </button>
                    <button
                      onClick={() => setVideoModel("v2")}
                      disabled={!!referenceVideo}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                        (referenceVideo ? "v1" : videoModel) === "v2"
                          ? "bg-white text-black"
                          : "bg-white/10 text-gray-400 hover:text-white"
                      } ${referenceVideo ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      V2
                    </button>
                  </div>
                  {referenceVideo && (
                    <p className="text-xs text-gray-500 font-mono mt-1">V2 unavailable with reference video</p>
                  )}
                </div>

                {/* Match Reference Pose Toggle - only shown when reference video is present */}
                {referenceVideo && (
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={matchReferencePose}
                      onChange={(e) => setMatchReferencePose(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-transparent text-white focus:ring-white focus:ring-offset-0"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white font-mono">Match Reference Pose</span>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">Generate intermediate image matching the video&apos;s first frame pose</p>
                    </div>
                  </label>
                )}

                {/* Subtitle Toggle */}
                <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={addSubtitles}
                    onChange={(e) => setAddSubtitles(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-transparent text-white focus:ring-white focus:ring-offset-0"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-white font-mono">Add Subtitles</span>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">Auto-generate captions using AI</p>
                  </div>
                </label>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || initialReferenceVideoLoading}
                className="w-full py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {initialReferenceVideoLoading ? "Loading ref video..." : "Generate Video"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
