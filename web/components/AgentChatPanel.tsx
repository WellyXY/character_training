"use client";

import { useState, useEffect, useRef } from "react";
import type { ConversationState, PendingGeneration, Image, GenerationTask, ReferenceImageMode } from "@/lib/types";
import { resolveApiUrl, uploadFile } from "@/lib/api";
import { REFERENCE_MODES } from "@/lib/constants";
import GenerationProgressCard from "./GenerationProgressCard";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actionTaken?: string;
  referenceImageUrl?: string;  // URL of attached reference image
}

// Display name mappings
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
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "1:1", label: "1:1 (Square)" },
  { value: "16:9", label: "16:9 (Landscape)" },
] as const;

interface ConfirmationCardProps {
  pending: PendingGeneration;
  onConfirm: (aspectRatio: string, editedPrompt?: string) => void;
  onCancel: () => void;
  onModify: (modification: string) => void;
  loading: boolean;
}

function ConfirmationCard({
  pending,
  onConfirm,
  onCancel,
  onModify,
  loading,
}: ConfirmationCardProps) {
  const [selectedRatio, setSelectedRatio] = useState<string>(
    pending.params.aspect_ratio || "9:16"
  );
  const [editedPrompt, setEditedPrompt] = useState<string>(pending.optimized_prompt || "");
  const [isPromptEdited, setIsPromptEdited] = useState(false);

  // Update editedPrompt when pending changes (e.g., after modification)
  const currentPrompt = pending.optimized_prompt || "";
  if (!isPromptEdited && editedPrompt !== currentPrompt) {
    setEditedPrompt(currentPrompt);
  }

  return (
    <div className="rounded-2xl border border-[#333] bg-[#111] p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-[#cbcbcb] font-mono">
          Pending Confirmation
        </p>
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
          {pending.skill === "image_generator" ? "Image" : "Video"}
        </span>
      </div>

      {/* Parameters */}
      <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5 text-sm">
        {pending.params.style && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-mono text-xs uppercase tracking-wide">Style</span>
            <span className="text-white font-mono text-xs font-bold">
              {STYLE_DISPLAY[pending.params.style] || pending.params.style}
            </span>
          </div>
        )}
        {pending.params.cloth && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-mono text-xs uppercase tracking-wide">Outfit</span>
            <span className="text-white font-mono text-xs font-bold">
              {CLOTH_DISPLAY[pending.params.cloth] || pending.params.cloth}
            </span>
          </div>
        )}
        {pending.params.reference_image_path && (
          <>
            <div className="border-t border-white/5" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveApiUrl(pending.params.reference_image_path)}
                  alt="Reference"
                  className="w-10 h-10 object-cover rounded-lg border border-white/10"
                />
                <div>
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Reference</p>
                  {pending.params.reference_image_mode && (
                    <p className="text-xs text-white font-mono font-bold">
                      {REFERENCE_MODES.find(m => m.key === pending.params.reference_image_mode)?.label || pending.params.reference_image_mode}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Optimized Prompt */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest font-bold">Prompt</p>
          {isPromptEdited && (
            <span className="text-[10px] text-white font-mono uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded">Edited</span>
          )}
        </div>
        <textarea
          value={editedPrompt}
          onChange={(e) => {
            setEditedPrompt(e.target.value);
            setIsPromptEdited(true);
          }}
          disabled={loading}
          className="w-full text-xs text-gray-300 bg-black/40 rounded-xl p-3 h-24 resize-none border border-white/5 focus:border-white/20 focus:outline-none disabled:opacity-50 font-mono leading-relaxed"
          placeholder="Enter or edit prompt..."
        />
      </div>

      {/* Aspect Ratio */}
      <div className="mt-4">
        <p className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-widest font-bold">Aspect Ratio</p>
        <div className="flex gap-2">
          {ASPECT_RATIO_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedRatio(option.value)}
              disabled={loading}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-mono font-bold uppercase tracking-wide transition-all ${
                selectedRatio === option.value
                  ? "bg-white text-black shadow-lg"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
              } disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Reasoning */}
      <div className="mt-4 rounded-xl bg-white/[0.02] border border-white/5 p-3">
        <p className="text-[10px] text-gray-500 mb-1.5 font-mono uppercase tracking-widest font-bold">AI Reasoning</p>
        <p className="text-xs text-gray-400 font-mono leading-relaxed">{pending.reasoning}</p>
      </div>

      {/* Quick Adjustments */}
      {pending.suggestions && pending.suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-widest font-bold">Quick Adjustments</p>
          <div className="flex flex-wrap gap-1.5">
            {pending.suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onModify(suggestion)}
                disabled={loading}
                className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onConfirm(selectedRatio, isPromptEdited ? editedPrompt : undefined)}
          className="flex-1 rounded-lg bg-white px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50 transition-colors shadow-lg"
        >
          {loading ? "Generating..." : "Confirm"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wide text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface AgentChatPanelProps {
  messages: ChatMessage[];
  sessionId: string | null;
  conversationState: ConversationState | null;
  pendingGeneration: PendingGeneration | null;
  activeTasks: GenerationTask[];
  onSend: (message: string, referenceImagePath?: string, referenceImageUrl?: string, referenceImageMode?: ReferenceImageMode) => void;
  onConfirm: (aspectRatio: string, modifications?: string, editedPrompt?: string) => void;
  onCancel: () => void;
  onClear: () => void;
  onTaskComplete: (taskId: string, resultUrl: string) => void;
  onTaskError: (taskId: string, error: string) => void;
  loading: boolean;
  characterName: string | null;
  availableImages: Image[];
  initialReferenceUrl?: string | null;  // Pre-filled reference image from URL parameter
  hideHeader?: boolean;
}

export default function AgentChatPanel({
  messages,
  sessionId,
  conversationState,
  pendingGeneration,
  activeTasks,
  onSend,
  onConfirm,
  onCancel,
  onClear,
  onTaskComplete,
  onTaskError,
  loading,
  characterName,
  availableImages,
  initialReferenceUrl,
  hideHeader,
}: AgentChatPanelProps) {
  const [input, setInput] = useState("");
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedReferenceImage, setSelectedReferenceImage] = useState<Image | null>(null);
  const [uploadedReferenceImage, setUploadedReferenceImage] = useState<{ url: string; fullUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [referenceMode, setReferenceMode] = useState<ReferenceImageMode>("pose_background");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);
  const [initialRefApplied, setInitialRefApplied] = useState(false);
  const [showRefModePopup, setShowRefModePopup] = useState(false);

  const isAwaitingConfirmation = conversationState === "awaiting_confirmation";

  // Apply initial reference URL from query parameter (once)
  useEffect(() => {
    if (initialReferenceUrl && !initialRefApplied) {
      // Extract path from full URL if necessary (e.g., https://.../.../file.jpg -> /uploads/.../file.jpg)
      let relativePath = initialReferenceUrl;
      if (initialReferenceUrl.startsWith("http://") || initialReferenceUrl.startsWith("https://")) {
        try {
          const urlObj = new URL(initialReferenceUrl);
          relativePath = urlObj.pathname;
        } catch {
          // If URL parsing fails, use as-is
        }
      }
      // Convert the relative URL to full URL for display
      const fullUrl = resolveApiUrl(relativePath);
      setUploadedReferenceImage({ url: relativePath, fullUrl });
      setInitialRefApplied(true);
    }
  }, [initialReferenceUrl, initialRefApplied]);

  // The active reference image (either selected from existing or uploaded)
  const hasReferenceImage = selectedReferenceImage || uploadedReferenceImage;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingGeneration, activeTasks]);

  const handleSend = () => {
    // Allow sending if:
    // 1. There's input text, OR
    // 2. There's a reference image with non-custom mode (can send without message)
    const hasReference = uploadedReferenceImage || selectedReferenceImage;
    const canSendWithoutMessage = hasReference && referenceMode !== "custom";

    if (loading) return;
    if (!input.trim() && !canSendWithoutMessage) return;

    // Use uploaded image path first, then selected existing image (only if image has URL)
    const referenceImagePath = uploadedReferenceImage?.url || (selectedReferenceImage?.image_url ?? undefined);
    // Get the full URL for display in chat
    const referenceImageUrl = uploadedReferenceImage?.fullUrl
      || (selectedReferenceImage?.image_url ? resolveApiUrl(selectedReferenceImage.image_url) : undefined);
    // Pass reference mode only if there's a reference image
    onSend(input.trim(), referenceImagePath, referenceImageUrl, hasReference ? referenceMode : undefined);
    setInput("");
    setSelectedReferenceImage(null);
    setUploadedReferenceImage(null);
    setShowImagePicker(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return;
    }

    setUploading(true);
    try {
      const response = await uploadFile(file);
      setUploadedReferenceImage({ url: response.url, fullUrl: response.full_url });
      // Clear any previously selected existing image
      setSelectedReferenceImage(null);
      setShowImagePicker(false);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const clearReferenceImage = () => {
    setSelectedReferenceImage(null);
    setUploadedReferenceImage(null);
  };

  const handleModify = (modification: string) => {
    // Use onConfirm with modifications instead of onSend to properly update pending_generation
    onConfirm("9:16", modification);
  };

  const getStateLabel = () => {
    switch (conversationState) {
      case "understanding":
        return "Understanding...";
      case "planning":
        return "Planning...";
      case "executing":
        return "Executing...";
      case "awaiting_confirmation":
        return "Awaiting Confirmation";
      default:
        return null;
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-[#333] bg-[#111] p-4 overflow-hidden">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
                Agent
              </p>
              <h2 className="text-lg font-semibold font-mono">AI Assistant</h2>
            </div>
            {getStateLabel() && (
              <span className="text-xs text-amber-400 animate-pulse font-mono uppercase tracking-wide">
                {getStateLabel()}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            {characterName ? `Character: ${characterName}` : "Please select a character"}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 flex flex-col rounded-xl border border-white/10 bg-[#0b0b0b] min-h-0 overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2 font-mono">Start a conversation</p>
              <p className="text-xs text-gray-500 font-mono">
                Example: &quot;Generate a sexy beach photo for me&quot;
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "bg-white/10 text-white ml-8"
                  : "bg-[#1a1a1a] text-gray-200 mr-8"
              }`}
            >
              <p className="text-xs uppercase tracking-widest text-[#cbcbcb] mb-1 font-mono">
                {message.role === "user" ? "You" : "AI"}
              </p>
              {/* Reference Image Attachment */}
              {message.referenceImageUrl && (
                <div className="mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.referenceImageUrl}
                    alt="Reference"
                    className="w-24 h-24 object-cover rounded-lg border border-white/20"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 font-mono uppercase tracking-wider">Reference Image</p>
                </div>
              )}
              <p className="whitespace-pre-wrap font-mono">{message.content}</p>
              {message.actionTaken && (
                <p className="mt-2 text-xs text-green-400 font-mono uppercase tracking-wide">
                  ✓ {message.actionTaken}
                </p>
              )}
            </div>
          ))
        )}

        {/* Confirmation Card */}
        {isAwaitingConfirmation && pendingGeneration && (
          <ConfirmationCard
            pending={pendingGeneration}
            onConfirm={(aspectRatio, editedPrompt) => onConfirm(aspectRatio, undefined, editedPrompt)}
            onCancel={onCancel}
            onModify={handleModify}
            loading={loading}
          />
        )}

        {/* Active Generation Tasks */}
        {activeTasks.map((task) => (
          <GenerationProgressCard
            key={task.task_id}
            task={task}
            onComplete={(resultUrl) => onTaskComplete(task.task_id, resultUrl)}
            onError={(error) => onTaskError(task.task_id, error)}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

        {/* Suggestion Bubbles - fixed at bottom of chat */}
        <div
          ref={suggestionsRef}
          className="flex-shrink-0 overflow-x-auto scrollbar-hide cursor-grab select-none border-t border-white/10 p-3"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onMouseDown={(e) => {
            setIsDragging(true);
            setDragStartX(e.pageX - (suggestionsRef.current?.offsetLeft || 0));
            setDragScrollLeft(suggestionsRef.current?.scrollLeft || 0);
          }}
          onMouseMove={(e) => {
            if (!isDragging || !suggestionsRef.current) return;
            e.preventDefault();
            const x = e.pageX - (suggestionsRef.current.offsetLeft || 0);
            suggestionsRef.current.scrollLeft = dragScrollLeft - (x - dragStartX);
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <div className="flex flex-col gap-2 w-max">
            {[
              [
                { label: "Ins Post", message: "Reference this Instagram post: " },
                { label: "Daily Vlog", message: "Generate a casual daily vlog clip, walking around the city with natural lighting" },
                { label: "Short Video", message: "Create a short video with smooth transitions and trendy background music" },
                { label: "Sexy Photo", message: "Generate a sexy photo shoot with elegant poses and warm lighting" },
                { label: "Beach Scene", message: "Create a beach scene photo with sunset lighting and relaxed vibes" },
              ],
              [
                { label: "Home Casual", message: "Generate a cozy home casual shot with soft natural light" },
                { label: "Fashion Shoot", message: "Create a high-fashion editorial photo with dramatic lighting" },
                { label: "Dance Video", message: "Generate a short dance video with energetic moves and dynamic angles" },
                { label: "Cute Selfie", message: "Generate a cute selfie-style photo with soft focus and bright colors" },
                { label: "Outfit Change", message: "Generate a series showing different outfit styles and poses" },
              ],
            ].map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-2">
                {row.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => setInput(suggestion.message)}
                    className="flex-shrink-0 whitespace-nowrap rounded-full border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="mt-4 space-y-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Image Picker Dropdown */}
        {showImagePicker && (
          <div className="p-2 rounded-lg bg-[#1a1a1a] border border-white/10 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Select or upload a reference image</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs text-gray-300 hover:text-white disabled:opacity-50 font-mono uppercase tracking-wide"
              >
                {uploading ? "Uploading..." : "+ Upload Image"}
              </button>
            </div>
            {availableImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {availableImages.filter(img => img.image_url).map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      setSelectedReferenceImage(img);
                      setUploadedReferenceImage(null);
                      setShowImagePicker(false);
                    }}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                      selectedReferenceImage?.id === img.id
                        ? "border-white"
                        : "border-transparent hover:border-white/30"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveApiUrl(img.image_url!)}
                      alt="Select"
                      className="w-full h-full object-cover"
                    />
                    <span
                      className={`absolute bottom-0 left-0 right-0 text-[8px] text-white py-0.5 ${
                        img.type === "base" ? "bg-green-500/80" : "bg-white/30"
                      }`}
                    >
                      {img.type === "base" ? "Base" : "Content"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wide">No images available</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 disabled:opacity-50 font-mono uppercase tracking-wide"
                >
                  {uploading ? "Uploading..." : "Upload reference image"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Apply Ref Popup */}
        {showRefModePopup && hasReferenceImage && (
          <div className="p-3 rounded-lg bg-[#1a1a1a] border border-white/20 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Reference Mode</p>
              <button
                type="button"
                onClick={() => { clearReferenceImage(); setShowRefModePopup(false); }}
                className="text-[10px] text-gray-500 hover:text-red-400 font-mono uppercase"
              >
                Remove Ref
              </button>
            </div>
            <div className="space-y-1">
              {REFERENCE_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setReferenceMode(mode.key)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                    referenceMode === mode.key
                      ? "bg-white/10 border border-white/30"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                        referenceMode === mode.key ? "border-white" : "border-gray-500"
                      }`}
                    >
                      {referenceMode === mode.key && (
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
            <button
              type="button"
              onClick={() => { setShowRefModePopup(false); handleSend(); }}
              disabled={loading || (referenceMode === "custom" && !input.trim())}
              className="w-full py-2 rounded-lg bg-white text-black text-xs font-mono font-bold uppercase tracking-wide hover:bg-gray-200 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        )}

        {/* Input Row */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowImagePicker(!showImagePicker)}
            disabled={!characterName || loading || uploading}
            className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-50 ${
              showImagePicker || hasReferenceImage
                ? "border-white bg-white/10 text-white"
                : "border-[#333] text-gray-400 hover:border-white/30 hover:text-white"
            }`}
            title="Select or upload a reference image"
          >
            {uploading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              !characterName
                ? "Please select a character first..."
                : isAwaitingConfirmation
                ? "Enter adjustments or click confirm..."
                : "Enter a message..."
            }
            disabled={!characterName || loading}
            className="flex-1 h-20 rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
          />
        </div>
        <div className="flex gap-2">
          {hasReferenceImage ? (
            <button
              type="button"
              disabled={loading || !characterName}
              onClick={() => setShowRefModePopup(!showRefModePopup)}
              className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-amber-400 disabled:opacity-50"
            >
              Apply Ref
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || !characterName || !input.trim()}
              onClick={handleSend}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
            >
              Send
            </button>
          )}
          <button
            type="button"
            disabled={loading || messages.length === 0}
            onClick={onClear}
            className="flex-1 rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-white hover:text-gray-300 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
