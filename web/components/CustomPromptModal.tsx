"use client";

import { useState } from "react";
import type { Image } from "@/lib/types";
import { resolveApiUrl, generateDirect, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface CustomPromptModalProps {
  characterId: string;
  baseImages: Image[];
  onClose: () => void;
  onGenerated: () => void;
}

export default function CustomPromptModal({
  characterId,
  baseImages,
  onClose,
  onGenerated,
}: CustomPromptModalProps) {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResultUrl(null);
    try {
      const image = await generateDirect({
        character_id: characterId,
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
      });
      setResultUrl(image.image_url || null);
      onGenerated();
      refreshUser(); // Refresh token balance
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Insufficient tokens. Please contact your administrator.");
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
      refreshUser(); // Refresh in case balance changed
    } finally {
      setLoading(false);
    }
  };

  const ratios = ["9:16", "1:1", "16:9"];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-white">
            Custom Prompt Generation
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 text-white text-sm hover:bg-white/20"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Base Images Preview */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb] mb-2">
              Base Images ({baseImages.length}/3)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {baseImages.map((img) => (
                <div
                  key={img.id}
                  className="aspect-[9/16] overflow-hidden rounded-lg border border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(img.image_url!)}
                    alt="Base"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Input */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb] mb-2">
              Prompt
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt directly (e.g. a woman lying on bed, wearing red lingerie, soft lighting...)"
              rows={5}
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white font-mono focus:border-white/30 focus:outline-none resize-none"
            />
          </div>

          {/* Aspect Ratio */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb] mb-2">
              Aspect Ratio
            </p>
            <div className="flex gap-2">
              {ratios.map((r) => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                    aspectRatio === r
                      ? "border-white bg-white text-black"
                      : "border-[#333] bg-[#0b0b0b] text-gray-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          {/* Result */}
          {resultUrl && (
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-green-400 mb-2">
                Generated
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveApiUrl(resultUrl)}
                alt="Generated"
                className="w-full max-h-[400px] object-contain rounded-lg border border-white/10"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-[#1a1a1a] border border-[#333] px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wide text-white hover:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
