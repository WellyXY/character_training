"use client";

import { useState } from "react";
import type { Character, Image } from "@/lib/types";
import { resolveApiUrl } from "@/lib/api";

interface CharacterSidebarProps {
  characters: Character[];
  selectedCharacter: Character | null;
  baseImages: Image[];
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string, gender?: string) => Promise<void>;
  onApproveImage: (imageId: string) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  loading: boolean;
}

export default function CharacterSidebar({
  characters,
  selectedCharacter,
  baseImages,
  onSelect,
  onCreate,
  onApproveImage,
  onDeleteImage,
  loading,
}: CharacterSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gender, setGender] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await onCreate(name.trim(), description.trim(), gender || undefined);
    setName("");
    setDescription("");
    setGender("");
    setShowCreate(false);
  };

  const approvedImages = baseImages.filter((img) => img.is_approved);
  const pendingImages = baseImages.filter((img) => !img.is_approved);

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
          <h3 className="font-semibold text-white font-mono">{selectedCharacter.name}</h3>
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
                onClick={() => setSelectedImage(resolveApiUrl(img.image_url))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveApiUrl(img.image_url)}
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
                    onClick={() => setSelectedImage(resolveApiUrl(img.image_url))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveApiUrl(img.image_url)}
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
        </div>
      )}

      {/* Create Character */}
      <div className="mt-auto pt-4 border-t border-white/10">
        {showCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Character name"
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white font-mono"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Character description"
              rows={2}
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white font-mono"
            />
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white font-mono"
            >
              <option value="">Gender (optional)</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-white hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-white hover:text-gray-300"
          >
            + New Character
          </button>
        )}
      </div>

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
