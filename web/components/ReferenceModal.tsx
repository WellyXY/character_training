"use client";

import { useState } from "react";
import type { SamplePost, ReferenceImageMode } from "@/lib/types";
import { resolveApiUrl } from "@/lib/api";
import { REFERENCE_MODES } from "@/lib/constants";

interface ReferenceModalProps {
  sample: SamplePost;
  characterId: string;
  characterName: string | null;
  onClose: () => void;
  onGenerated: (mode: ReferenceImageMode, customMessage?: string) => void;
}

export default function ReferenceModal({
  sample,
  characterId,
  characterName,
  onClose,
  onGenerated,
}: ReferenceModalProps) {
  const [selectedMode, setSelectedMode] = useState<ReferenceImageMode>("pose_background");
  const [customMessage, setCustomMessage] = useState("");

  const handleGenerate = () => {
    if (selectedMode === "custom" && !customMessage.trim()) {
      return;
    }
    onGenerated(selectedMode, selectedMode === "custom" ? customMessage.trim() : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-2xl border border-[#333] max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-semibold font-mono">Apply Reference</h2>
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
            <div className="w-48 flex-shrink-0">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveApiUrl(sample.thumbnail_url || sample.media_url)}
                  alt="Reference"
                  className="w-full h-auto object-cover"
                />
              </div>
              <p className="text-xs text-gray-500 font-mono mt-2 text-center">
                @{sample.creator_name}
              </p>
            </div>

            {/* Right: Controls */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Character */}
              <p className="text-xs text-gray-400 font-mono mb-4">
                Character: <span className="text-white">{characterName || "Unknown"}</span>
              </p>

              {/* Reference Mode */}
              <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Reference Mode</p>
              <div className="space-y-1 mb-4">
                {REFERENCE_MODES.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setSelectedMode(mode.key)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                      selectedMode === mode.key
                        ? "bg-white/10 border border-white/30"
                        : "hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                          selectedMode === mode.key ? "border-white" : "border-gray-500"
                        }`}
                      >
                        {selectedMode === mode.key && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="text-xs font-medium text-white font-mono uppercase tracking-wide">
                        {mode.label}
                        {mode.key === "pose_background" && (
                          <span className="ml-1 text-amber-400">(Recommended)</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 ml-5 mt-0.5 font-mono">
                      {mode.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Custom message input */}
              {selectedMode === "custom" && (
                <div className="mb-4">
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Describe what you want..."
                    rows={3}
                    className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 resize-none font-mono"
                  />
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={selectedMode === "custom" && !customMessage.trim()}
                className="w-full py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
