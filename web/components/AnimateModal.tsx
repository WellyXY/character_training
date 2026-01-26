"use client";

import { useState, useEffect } from "react";
import type { Image } from "@/lib/types";
import {
  resolveApiUrl,
  analyzeImageForAnimation,
  animateImage,
  type AnalyzeImageResponse,
} from "@/lib/api";

interface AnimateModalProps {
  image: Image;
  characterId: string;
  onClose: () => void;
  onVideoCreated: () => void;
}

type ModalState = "analyzing" | "ready" | "generating" | "success" | "error";

export default function AnimateModal({
  image,
  characterId,
  onClose,
  onVideoCreated,
}: AnimateModalProps) {
  const [state, setState] = useState<ModalState>("analyzing");
  const [analysis, setAnalysis] = useState<AnalyzeImageResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Analyze image on mount
  useEffect(() => {
    const analyze = async () => {
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setState("generating");
    setError(null);

    try {
      const result = await animateImage({
        image_id: image.id,
        image_url: image.image_url,
        character_id: characterId,
        prompt: prompt.trim(),
      });

      if (result.success && result.video_url) {
        // Success - show video preview and notify parent
        setVideoUrl(result.video_url);
        setState("success");
        onVideoCreated();
      } else {
        setError(result.message || "Video generation failed");
        setState("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video generation failed");
      setState("error");
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
                {state === "success" && videoUrl ? (
                  <video
                    src={resolveApiUrl(videoUrl)}
                    controls
                    autoPlay
                    loop
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.image_url ? resolveApiUrl(image.image_url) : ""}
                    alt="Source"
                    className="h-full w-full object-cover"
                  />
                )}
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
              {(state === "ready" || state === "error" || state === "generating") && (
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
                            className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-mono font-bold uppercase tracking-wide hover:bg-blue-500/30 transition-colors"
                          >
                            {motionType}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prompt Input */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-1 font-mono uppercase tracking-wider">Video Prompt</p>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the motion/animation..."
                      rows={4}
                      disabled={state === "generating"}
                      className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50 font-mono"
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
                    disabled={state === "generating" || !prompt.trim()}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
                  >
                    {state === "generating" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Generate Video
                      </>
                    )}
                  </button>

                  {state === "generating" && (
                    <p className="mt-2 text-xs text-gray-400 text-center font-mono">
                      Video generation may take a few minutes. Please wait...
                    </p>
                  )}
                </>
              )}

              {/* Success State */}
              {state === "success" && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-white mb-2 font-mono">Video generated!</p>
                  <p className="text-sm text-gray-400 mb-4 font-mono">Video saved to Gallery</p>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-xs font-mono font-bold uppercase tracking-wide text-white hover:text-gray-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
