"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Image, GenerationTask, ReferenceImageMode, SamplePost } from "@/lib/types";
import { resolveApiUrl, uploadFile, listSamples } from "@/lib/api";
import { REFERENCE_MODES } from "@/lib/constants";
import GenerationProgressCard from "./GenerationProgressCard";

// Display name mappings (shared with AgentChatPanel)
const STYLE_DISPLAY: Record<string, string> = {
  sexy: "Sexy",
  exposed: "Exposed",
  erotic: "Erotic",
  home: "Home",
  warm: "Warm",
  cute: "Cute",
};

const CLOTH_DISPLAY: Record<string, string> = {
  autumn_winter: "Autumn/Winter",
  sports: "Sportswear",
  sexy_lingerie: "Sexy Lingerie",
  sexy_underwear: "Underwear",
  nude: "Nude",
  home_wear: "Loungewear",
  daily: "Everyday Outfit",
  fashion: "Fashion",
};

const ASPECT_RATIO_OPTIONS = [
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
] as const;

interface ImageGenPanelProps {
  characterId: string | null;
  availableImages: Image[];
  activeTasks: GenerationTask[];
  onGenerate: (
    message: string,
    aspectRatio: string,
    referenceImagePath?: string,
    referenceImageMode?: ReferenceImageMode
  ) => void;
  onTaskComplete: (taskId: string, resultUrl: string) => void;
  onTaskError: (taskId: string, error: string) => void;
  onSaveToGallery: () => void;
  loading: boolean;
}

export default function ImageGenPanel({
  characterId,
  availableImages,
  activeTasks,
  onGenerate,
  onTaskComplete,
  onTaskError,
  onSaveToGallery,
  loading,
}: ImageGenPanelProps) {
  const [allSamples, setAllSamples] = useState<SamplePost[]>([]);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [cloth, setCloth] = useState<string | null>(null);
  const [completedPreviews, setCompletedPreviews] = useState<{ taskId: string; resultUrl: string }[]>([]);

  // Fetch community samples once
  useEffect(() => {
    listSamples({ media_type: "image", limit: 20 })
      .then(setAllSamples)
      .catch(() => {});
  }, []);

  // Pick 2 random samples (stable until allSamples changes)
  const randomSamples = useMemo(() => {
    if (allSamples.length <= 2) return allSamples;
    const shuffled = [...allSamples].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }, [allSamples]);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [selectedRefImage, setSelectedRefImage] = useState<Image | null>(null);
  const [uploadedRef, setUploadedRef] = useState<{ url: string; fullUrl: string } | null>(null);
  const [referenceMode, setReferenceMode] = useState<ReferenceImageMode>("pose_background");
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasRef = selectedRefImage || uploadedRef;

  const handleGenerate = () => {
    // Build message from form fields
    const parts: string[] = [];
    if (style) parts.push(`Generate a ${STYLE_DISPLAY[style]?.toLowerCase() || style} photo`);
    if (cloth) parts.push(`with ${CLOTH_DISPLAY[cloth]?.toLowerCase() || cloth}`);
    if (prompt.trim()) parts.push(prompt.trim());

    // When only reference image is provided, use a default message
    const message = parts.length > 0 ? parts.join(". ") : (hasRef ? "Generate using reference image" : "");
    if (!message) return;

    const refPath = uploadedRef?.url || (selectedRefImage?.image_url ?? undefined);
    onGenerate(message, aspectRatio, refPath, hasRef ? referenceMode : undefined);

    // Reset form
    setPrompt("");
    setStyle(null);
    setCloth(null);
    setSelectedRefImage(null);
    setUploadedRef(null);
    setShowImagePicker(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const response = await uploadFile(file);
      setUploadedRef({ url: response.url, fullUrl: response.full_url });
      setSelectedRefImage(null);
      setShowImagePicker(false);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const pendingTasks = activeTasks.filter(
    (t) => (t.status === "pending" || t.status === "generating") && !t.task_id.startsWith("animate-")
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[#333] bg-[#111] p-4 overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Community Samples */}
        {randomSamples.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Inspiration</p>
              <a
                href="/samples"
                className="text-[10px] text-gray-500 hover:text-white font-mono uppercase tracking-wide transition-colors"
              >
                View All
              </a>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {randomSamples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => setPrompt(sample.caption || "")}
                  className="relative aspect-[3/2] overflow-hidden rounded-lg border border-white/10 hover:border-white/30 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(sample.thumbnail_url || sample.media_url)}
                    alt={sample.caption || "Sample"}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <span className="text-[9px] text-white font-mono leading-tight line-clamp-2">
                      {sample.caption || "Use as inspiration"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!characterId || uploading}
              className="mt-1.5 w-full py-2 rounded-lg bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors"
            >
              {uploading ? "Uploading..." : "Upload Image"}
            </button>
          </div>
        )}

        {/* Prompt */}
        {!hasRef && <div>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1.5">Prompt</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={4}
            disabled={!characterId}
            className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 resize-none font-mono disabled:opacity-50"
          />
        </div>}

        {/* Style & Outfit */}
        {!hasRef && <div>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1.5">Style &amp; Outfit</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STYLE_DISPLAY).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStyle(style === key ? null : key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  style === key
                    ? "bg-white text-black"
                    : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <hr className="border-white/10 my-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CLOTH_DISPLAY).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCloth(cloth === key ? null : key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  cloth === key
                    ? "bg-white text-black"
                    : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>}

        {/* Settings: Aspect Ratio + Reference */}
        <div>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1.5">Settings</p>
          <div className="flex gap-2 items-center">
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAspectRatio(option.value)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  aspectRatio === option.value
                    ? "bg-white text-black"
                    : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                {option.label}
              </button>
            ))}
            {hasRef && (
            <button
              type="button"
              onClick={() => { setSelectedRefImage(null); setUploadedRef(null); }}
              disabled={!characterId}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors disabled:opacity-50 bg-white text-black"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Ref ✕
            </button>
          )}
          </div>

          {/* Reference preview when set */}
          {hasRef && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedRef ? uploadedRef.fullUrl : resolveApiUrl(selectedRefImage!.image_url!)}
                  alt="Reference"
                  className="w-12 h-12 object-cover rounded-lg border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-mono truncate">Reference attached</p>
                  <p className="text-[10px] text-gray-500 font-mono">
                    {REFERENCE_MODES.find(m => m.key === referenceMode)?.label || referenceMode}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {REFERENCE_MODES.filter(m => m.key !== "custom").map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setReferenceMode(mode.key)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                      referenceMode === mode.key
                        ? "bg-white/10 border border-white/20"
                        : "hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <span className="text-xs font-mono text-white">{mode.label}</span>
                    <p className="text-[10px] text-gray-500 font-mono">{mode.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reference select — always visible when no ref attached */}
          {!hasRef && (
            <div className="mt-2">
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setShowImagePicker(!showImagePicker)}
                  disabled={!characterId}
                  className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
                >
                  Select Reference Image
                </button>
              </div>
              {showImagePicker && (
                <div className="p-2 rounded-lg bg-[#0b0b0b] border border-white/10 max-h-36 overflow-y-auto">
                  {availableImages.filter(img => img.image_url).length > 0 ? (
                    <div className="grid grid-cols-4 gap-1.5">
                      {availableImages.filter(img => img.image_url).map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => {
                            setSelectedRefImage(img);
                            setUploadedRef(null);
                            setShowImagePicker(false);
                          }}
                          className="relative aspect-square overflow-hidden rounded-lg border-2 border-transparent hover:border-white/30 transition-colors"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveApiUrl(img.image_url!)}
                            alt="Select"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 font-mono text-center py-4">No images available</p>
                  )}
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Active Tasks */}
        {pendingTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Progress</p>
            {pendingTasks.map((task) => (
              <GenerationProgressCard
                key={task.task_id}
                task={task}
                onComplete={(resultUrl) => {
                  setCompletedPreviews((prev) => [...prev, { taskId: task.task_id, resultUrl }]);
                  onTaskComplete(task.task_id, resultUrl);
                }}
                onError={(error) => onTaskError(task.task_id, error)}
              />
            ))}
          </div>
        )}

        {/* Completed Previews — waiting for user to Save */}
        {completedPreviews.map(({ taskId, resultUrl }) => (
          <div key={taskId} className="rounded-xl overflow-hidden border border-white/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveApiUrl(resultUrl)}
              alt="Generated"
              className="w-full aspect-[9/16] object-cover"
            />
            <button
              type="button"
              onClick={() => {
                onSaveToGallery();
                setCompletedPreviews((prev) => prev.filter((p) => p.taskId !== taskId));
              }}
              className="w-full py-2.5 bg-white hover:bg-gray-200 text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors"
            >
              Save to Gallery
            </button>
          </div>
        ))}
      </div>

      {/* Generate Button */}
      <div className="flex-shrink-0 pt-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !characterId || (!prompt.trim() && !style && !hasRef)}
          className="w-full py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {loading ? "Generating..." : "Generate Image"}
        </button>
      </div>
    </section>
  );
}
