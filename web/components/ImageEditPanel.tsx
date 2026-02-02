"use client";

import { useState, useRef, useEffect } from "react";
import type { Image } from "@/lib/types";
import { directImageEdit, saveEditedImage, resolveApiUrl } from "@/lib/api";

interface EditMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  isSaved?: boolean;
  timestamp: Date;
}

interface ImageEditPanelProps {
  sourceImage: Image;
  characterId: string | null;
  onImageGenerated: () => void;
  onClose: () => void;
  onTaskStarted?: (task: { task_id: string; prompt: string; reference_image_url?: string }) => void;
}

const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;

export default function ImageEditPanel({
  sourceImage,
  characterId,
  onImageGenerated,
  onClose,
}: ImageEditPanelProps) {
  const [messages, setMessages] = useState<EditMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setSaving] = useState<string | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<string>("9:16");
  const [currentSourceImage, setCurrentSourceImage] = useState<string>(
    sourceImage.image_url || ""
  );
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating || !characterId) return;

    const userMessage = inputValue.trim();
    setInputValue("");

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    setIsGenerating(true);

    try {
      // Direct API call for generation
      const result = await directImageEdit({
        prompt: userMessage,
        source_image_path: currentSourceImage,
        character_id: characterId,
        aspect_ratio: selectedRatio,
      });

      if (result.success && result.image_url) {
        // Add assistant message with generated image (not saved yet)
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "Image generated. Click Save to add to gallery.",
            imageUrl: result.image_url,
            metadata: result.metadata,
            isSaved: false,
            timestamp: new Date(),
          },
        ]);

        // Update current source image for next edit
        // Use the relative path for consistency
        const newSourcePath = result.image_url.includes("/uploads/")
          ? `/uploads/${result.image_url.split("/uploads/")[1]}`
          : result.image_url;
        setCurrentSourceImage(newSourcePath);
      } else {
        // Show error message
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `Error: ${result.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message || !message.imageUrl || !message.metadata || !characterId) return;

    setSaving(messageId);

    try {
      const result = await saveEditedImage({
        image_url: message.imageUrl,
        character_id: characterId,
        metadata: message.metadata,
      });

      if (result.success) {
        // Mark message as saved
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, isSaved: true, content: "Saved to gallery" }
              : m
          )
        );
        // Notify parent to refresh gallery
        onImageGenerated();
      } else {
        // Show error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: `Save failed: ${result.message}` }
              : m
          )
        );
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: `Save failed: ${error instanceof Error ? error.message : "Unknown error"}` }
            : m
        )
      );
    } finally {
      setSaving(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-[#333]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#333]">
        <div>
          <h3 className="text-lg font-semibold text-white font-mono">
            Image Editor
          </h3>
          <p className="text-xs text-gray-400 font-mono">
            Describe the edit you want
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm font-mono">Enter the edit you want</p>
            <p className="text-xs mt-1 font-mono">
              For example: &quot;Change the background to a beach&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-white/15 text-white"
                  : "bg-white/10 text-gray-200"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap font-mono">
                {msg.content}
              </p>
              {msg.imageUrl && (
                <div className="mt-2 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(msg.imageUrl)}
                    alt="Generated"
                    className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setEnlargedImage(msg.imageUrl!)}
                  />
                  {/* Save button overlay */}
                  {msg.metadata && !msg.isSaved && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave(msg.id);
                      }}
                      disabled={isSaving === msg.id}
                      className="absolute top-2 right-2 px-3 py-1.5 bg-white text-black text-xs font-mono font-bold uppercase tracking-wide rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors shadow-lg"
                    >
                      {isSaving === msg.id ? (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Saving
                        </span>
                      ) : (
                        "Save"
                      )}
                    </button>
                  )}
                  {/* Saved indicator */}
                  {msg.isSaved && (
                    <div className="absolute top-2 right-2 px-3 py-1.5 bg-green-500/90 text-white text-xs font-mono font-bold uppercase tracking-wide rounded-lg shadow-lg flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Saved
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-white/50 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-white/50 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-white/50 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-sm text-gray-400 font-mono">
                  Generating...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Current Reference Image + Aspect Ratio */}
      <div className="px-4 py-3 border-t border-[#333]">
        <div className="flex items-center gap-3">
          {/* Reference thumbnail */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
              <img
                src={resolveApiUrl(currentSourceImage)}
                alt="Reference"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs text-gray-500 font-mono">Reference</span>
          </div>

          {/* Aspect ratio selector */}
          <div className="flex gap-1 ml-auto">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                onClick={() => setSelectedRatio(ratio)}
                disabled={isGenerating}
                className={`px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  selectedRatio === ratio
                    ? "bg-white text-black"
                    : "bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-white"
                } disabled:opacity-50`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#333]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the edit you want..."
            disabled={isGenerating}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-50 font-mono"
          />
          <button
            type="submit"
            disabled={isGenerating || !inputValue.trim()}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-mono font-bold uppercase tracking-wide hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </form>
      </div>

      {/* Enlarged Image Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <button
            type="button"
            onClick={() => setEnlargedImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 z-10"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveApiUrl(enlargedImage)}
            alt="Enlarged"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
