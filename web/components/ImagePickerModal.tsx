"use client";

import { useState, useEffect } from "react";
import type { Image } from "@/lib/types";
import { listCharacterImages, resolveApiUrl } from "@/lib/api";

interface ImagePickerModalProps {
  characterId: string;
  onSelect: (image: Image) => void;
  onClose: () => void;
}

export default function ImagePickerModal({
  characterId,
  onSelect,
  onClose,
}: ImagePickerModalProps) {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true);
        const data = await listCharacterImages(characterId);
        // Filter to only show completed images with URLs
        const completedImages = data.filter(
          (img) => img.status === "completed" && img.image_url
        );
        setImages(completedImages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load images");
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [characterId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-2xl border border-[#333] max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <div>
            <h2 className="text-lg font-semibold font-mono">Select Image</h2>
            <p className="text-xs text-gray-400 font-mono">
              Choose an image to animate with the reference video
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-400 font-mono">{error}</p>
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 font-mono">No images found</p>
              <p className="text-xs text-gray-500 font-mono mt-1">
                Generate some images first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => onSelect(image)}
                  className="group relative aspect-[9/16] rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(image.image_url || "")}
                    alt="Character"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-mono font-bold uppercase tracking-wide transition-opacity">
                      Select
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
