"use client";

import type { SamplePost } from "@/lib/types";
import { resolveApiUrl } from "@/lib/api";

interface SampleCardProps {
  sample: SamplePost;
  onSelect: (sample: SamplePost) => void;
  onApply: (sample: SamplePost) => void;
}

export default function SampleCard({
  sample,
  onSelect,
  onApply,
}: SampleCardProps) {
  const isVideo = sample.media_type === "video";
  const showVideoPreview = isVideo && (!sample.thumbnail_url || sample.thumbnail_url === sample.media_url);

  return (
    <div
      className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0b] group cursor-pointer"
      onClick={() => onSelect(sample)}
    >
      {/* Thumbnail */}
      {showVideoPreview ? (
        <video
          src={resolveApiUrl(sample.media_url)}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveApiUrl(sample.thumbnail_url)}
          alt={sample.creator_name}
          className="h-full w-full object-cover"
        />
      )}

      {/* Video Play Icon */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
        {/* Top: Creator Info */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] text-white font-bold">
            {sample.creator_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-white font-medium truncate font-mono">
            @{sample.creator_name}
          </span>
        </div>

        {/* Bottom: Tags & Apply Button */}
        <div>
          {/* Tags */}
          {sample.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {sample.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] text-white backdrop-blur-sm font-mono uppercase tracking-wide"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Apply Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onApply(sample);
            }}
            className="w-full rounded-lg bg-white px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 pointer-events-auto"
          >
            Apply Ref
          </button>
        </div>
      </div>

      {/* Media Type Badge */}
      <div className="absolute top-2 right-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] text-white backdrop-blur-sm ${
            isVideo ? "bg-blue-500/50" : "bg-green-500/50"
          } font-mono uppercase tracking-wide`}
        >
          {isVideo ? "Video" : "Image"}
        </span>
      </div>

      {/* Caption Preview (visible without hover) */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 group-hover:opacity-0 transition-opacity">
        {/* Tags */}
        {sample.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {sample.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded bg-white/20 text-[9px] text-white/90 backdrop-blur-sm font-mono uppercase tracking-wide"
              >
                {tag}
              </span>
            ))}
            {sample.tags.length > 3 && (
              <span className="text-[9px] text-white/60 font-mono">
                +{sample.tags.length - 3}
              </span>
            )}
          </div>
        )}
        <span className="text-xs text-white font-medium font-mono">
          @{sample.creator_name}
        </span>
      </div>
    </div>
  );
}
