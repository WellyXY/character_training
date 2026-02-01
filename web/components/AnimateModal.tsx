"use client";

import { useState, useEffect, useRef } from "react";
import type { Image } from "@/lib/types";
import {
  resolveApiUrl,
  analyzeImageForAnimation,
  animateImage,
  uploadFile,
  type AnalyzeImageResponse,
} from "@/lib/api";

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
}

type ModalState = "analyzing" | "ready" | "error";

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
}: AnimateModalProps) {
  const [state, setState] = useState<ModalState>("analyzing");
  const [analysis, setAnalysis] = useState<AnalyzeImageResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<ReferenceVideo | null>(
    initialReferenceVideo
      ? { file: null, url: initialReferenceVideo.url, duration: initialReferenceVideo.duration }
      : null
  );
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Analyze image on mount
  useEffect(() => {
    const analyze = async () => {
      if (!image.image_url) {
        setError("Image URL not available");
        setState("error");
        return;
      }
      try {
        const result = await analyzeImageForAnimation({
          image_id: image.id,
          image_url: image.image_url,
        });
        setAnalysis(result);
        setPrompt(result.suggested_prompt);
        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze image");
        setState("error");
      }
    };

    analyze();
  }, [image.id, image.image_url]);

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
    try {
      const result = await animateImage({
        image_id: image.id,
        image_url: image.image_url,
        character_id: characterId,
        prompt: prompt.trim(),
        reference_video_url: referenceVideo?.url ?? undefined,
        reference_video_duration: referenceVideo?.duration ?? undefined,
      });

      if (result.success) {
        // Video saved to DB server-side; refresh parent media
        onVideoCreated();
      }
    } catch (err) {
      console.error("Video generation failed:", err);
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
        className="bg-[#1a1a1a] rounded-2xl border border-[#333] max-w-3xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-semibold font-mono">Animate Image</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="flex gap-4">
            {/* Left: Image Preview */}
            <div className="w-1/3 flex-shrink-0">
              <div className="aspect-[9/16] rounded-xl overflow-hidden border border-white/10 bg-[#0b0b0b]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.image_url ? resolveApiUrl(image.image_url) : ""}
                  alt="Source"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex-1 flex flex-col">
              {/* Analyzing State */}
              {state === "analyzing" && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm font-mono">Analyzing image...</p>
                </div>
              )}

              {/* Ready/Error State */}
              {(state === "ready" || state === "error") && (
                <>
                  {/* Image Analysis */}
                  {analysis && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-1 font-mono uppercase tracking-wider">Image Analysis</p>
                      <p className="text-sm text-gray-200 bg-white/5 rounded-lg p-3 font-mono">
                        {analysis.image_analysis}
                      </p>
                    </div>
                  )}

                  {/* Motion Type Tags */}
                  {analysis && analysis.suggested_motion_types.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Suggested Motion Types</p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.suggested_motion_types.map((motionType, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleMotionTagClick(motionType)}
                            className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-gray-300 text-xs font-mono font-bold uppercase tracking-wide hover:text-white transition-colors"
                          >
                            {motionType}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reference Video Upload */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">
                      Reference Video (Optional)
                    </p>
                    {referenceVideo ? (
                      <div className="relative bg-[#0b0b0b] border border-white/10 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <video
                            src={resolveApiUrl(referenceVideo.url || "")}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-mono truncate">
                              {referenceVideo.file?.name || "Reference Video"}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                              Duration: {referenceVideo.duration?.toFixed(1)}s
                              {referenceVideo.duration && referenceVideo.duration >= 5 && referenceVideo.duration <= 10 && (
                                <span className="ml-2 text-blue-400">(--10sec)</span>
                              )}
                              {referenceVideo.duration && referenceVideo.duration > 10 && (
                                <span className="ml-2 text-blue-400">(--15sec)</span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={handleRemoveVideo}
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/30 text-white flex items-center justify-center"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept="video/*"
                          onChange={(e) => handleVideoUpload(e.target.files)}
                          className="hidden"
                        />
                        <div
                          onClick={() => videoInputRef.current?.click()}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                            dragOver
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-white/20 hover:border-white/40"
                          } ${uploadingVideo ? "opacity-50 pointer-events-none" : ""}`}
                        >
                          {uploadingVideo ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs text-gray-400 font-mono">Uploading...</span>
                            </div>
                          ) : (
                            <>
                              <svg className="w-6 h-6 mx-auto mb-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <p className="text-xs text-gray-400 font-mono">Drop video or click to upload</p>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Prompt Input */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-1 font-mono uppercase tracking-wider">Video Prompt</p>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the motion/animation..."
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

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    className="w-full py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate Video
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
