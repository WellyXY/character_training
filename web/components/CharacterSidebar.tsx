"use client";

import { useState } from "react";
import type { Character, Image } from "@/lib/types";
import { resolveApiUrl } from "@/lib/api";
import CustomPromptModal from "./CustomPromptModal";

interface CharacterSidebarProps {
  characters: Character[];
  selectedCharacter: Character | null;
  baseImages: Image[];
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string, gender?: string, referenceImagePaths?: string[]) => Promise<void>;
  onDeleteCharacter: (characterId: string) => Promise<void>;
  onApproveImage: (imageId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onRefresh?: () => void;
  onStartOnboarding?: () => void;
  loading: boolean;
}

export default function CharacterSidebar({
  characters,
  selectedCharacter,
  baseImages,
  onSelect,
  onCreate,
  onDeleteCharacter,
  onApproveImage,
  onDeleteImage,
  onRefresh,
  onStartOnboarding,
  loading,
}: CharacterSidebarProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const approvedImages = baseImages.filter((img) => img.is_approved && img.image_url);
  const pendingImages = baseImages.filter((img) => !img.is_approved && img.image_url);

  return (
    <aside className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
      {/* Header */}
      <div className="mb-4">
        <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
          Character
        </p>
        <h2 className="text-lg font-semibold font-mono">Character Management</h2>
      </div>

      {/* Character Selector */}
      <div className="mb-4">
        <select
          value={selectedCharacter?.id || ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none font-mono"
        >
          <option value="">Select a character...</option>
          {characters.map((char) => (
            <option key={char.id} value={char.id}>
              {char.name}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Character Info */}
      {selectedCharacter && (
        <div className="mb-4 rounded-xl border border-white/10 bg-[#0b0b0b] p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white font-mono">{selectedCharacter.name}</h3>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${selectedCharacter.name}"? This will remove all images and videos.`)) {
                  onDeleteCharacter(selectedCharacter.id);
                }
              }}
              disabled={loading}
              className="w-6 h-6 rounded bg-red-500/20 text-red-400 text-xs hover:bg-red-500/40 transition-colors disabled:opacity-50"
              title="Delete character"
            >
              ×
            </button>
          </div>
          {selectedCharacter.gender && (
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {selectedCharacter.gender === "female" ? "Female" : selectedCharacter.gender === "male" ? "Male" : selectedCharacter.gender}
            </p>
          )}
          {selectedCharacter.description && (
            <p className="text-xs text-gray-400 mt-2 line-clamp-3 font-mono">
              {selectedCharacter.description}
            </p>
          )}
          <p className="text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
            Status: {selectedCharacter.status}
          </p>
        </div>
      )}

      {/* Base Images */}
      {selectedCharacter && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
              Base Images ({approvedImages.length}/3)
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {approvedImages.map((img) => (
              <div
                key={img.id}
                className="relative aspect-[9/16] overflow-hidden rounded-lg border border-white/10 group cursor-pointer"
                onClick={() => setSelectedImage(resolveApiUrl(img.image_url!))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveApiUrl(img.image_url!)}
                  alt="Base"
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteImage(img.id);
                  }}
                  disabled={loading}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 3 - approvedImages.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="aspect-[9/16] rounded-lg border border-dashed border-white/20 flex items-center justify-center"
              >
                <span className="text-xs text-gray-500 font-mono">+</span>
              </div>
            ))}
          </div>

          {/* Pending Images */}
          {pendingImages.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2 font-mono uppercase tracking-wider">Pending ({pendingImages.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {pendingImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative aspect-[9/16] overflow-hidden rounded-lg border border-amber-500/30 cursor-pointer"
                    onClick={() => setSelectedImage(resolveApiUrl(img.image_url!))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveApiUrl(img.image_url!)}
                      alt="Pending"
                      className="h-full w-full object-cover opacity-70"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onApproveImage(img.id);
                        }}
                        disabled={loading || approvedImages.length >= 3}
                        className="flex-1 rounded bg-green-500/80 px-1 py-0.5 text-[10px] text-white font-mono uppercase tracking-wide disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img.id);
                        }}
                        disabled={loading}
                        className="flex-1 rounded bg-red-500/80 px-1 py-0.5 text-[10px] text-white font-mono uppercase tracking-wide"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Prompt Generation */}
          {approvedImages.length > 0 && (
            <button
              onClick={() => setShowCustomPrompt(true)}
              className="mt-4 w-full rounded-lg bg-[#1a1a1a] border border-dashed border-white/20 px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wide text-gray-400 hover:text-white hover:border-white/40 transition-colors"
            >
              Custom Prompt Generation
            </button>
          )}
        </div>
      )}

      {/* Create Character */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <button
          onClick={() => onStartOnboarding?.()}
          className="w-full rounded-lg bg-white hover:bg-gray-100 px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide text-black transition-colors"
        >
          + New Character
        </button>
      </div>

      {/* Custom Prompt Modal */}
      {showCustomPrompt && selectedCharacter && (
        <CustomPromptModal
          characterId={selectedCharacter.id}
          baseImages={approvedImages}
          onClose={() => setShowCustomPrompt(false)}
          onGenerated={() => {
            onRefresh?.();
          }}
        />
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 z-10"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedImage}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </aside>
  );
}
