"use client";

import { useState, useRef, useEffect } from "react";
import type { Image, PendingEdit, AgentChatResponse } from "@/lib/types";
import { imageEditChat, imageEditConfirm } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ImageEditPanelProps {
  sourceImage: Image;
  characterId: string | null;
  onImageGenerated: () => void;
  onClose: () => void;
  onTaskStarted?: (task: { task_id: string; prompt: string; reference_image_url?: string }) => void;
}

const QUICK_EDIT_BUTTONS = [
  { label: "Change Background", icon: "🏞️", prompt: "Change to a different background" },
  { label: "Change Outfit", icon: "👗", prompt: "Change to a different outfit" },
  { label: "Style Transfer", icon: "🎨", prompt: "Transform into a different style" },
  { label: "Remove Element", icon: "✂️", prompt: "Remove an element from the image" },
  { label: "Add Element", icon: "➕", prompt: "Add an element to the image" },
];

export default function ImageEditPanel({
  sourceImage,
  characterId,
  onImageGenerated,
  onClose,
  onTaskStarted,
}: ImageEditPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<string>("9:16");
  const [editedPrompt, setEditedPrompt] = useState<string>("");
  const [isPromptEdited, setIsPromptEdited] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInputValue("");
    setIsLoading(true);
    setPendingEdit(null);

    try {
      const response: AgentChatResponse = await imageEditChat({
        message,
        source_image_path: sourceImage.image_url,
        character_id: characterId,
        session_id: sessionId,
      });

      setSessionId(response.session_id);

      // Add assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.message },
      ]);

      // If awaiting confirmation, show the pending edit
      if (response.state === "awaiting_confirmation" && response.pending_edit) {
        setPendingEdit(response.pending_edit);
        setEditedPrompt(response.pending_edit.optimized_prompt || "");
        setIsPromptEdited(false);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingEdit || !sessionId || isLoading) return;

    setIsLoading(true);

    // Create a task and notify parent immediately, then close
    if (onTaskStarted) {
      const taskId = `edit-${Date.now()}`;
      onTaskStarted({
        task_id: taskId,
        prompt: isPromptEdited ? editedPrompt : pendingEdit.optimized_prompt,
        reference_image_url: sourceImage.image_url,
      });
    }

    // Close modal immediately after task submission
    onClose();

    try {
      const response: AgentChatResponse = await imageEditConfirm({
        session_id: sessionId,
        aspect_ratio: selectedRatio,
        edited_prompt: isPromptEdited ? editedPrompt : undefined,
        character_id: characterId,
        pending_edit: pendingEdit,
      });

      // Refresh gallery when done
      if (response.action_taken === "edited_image" || response.active_task) {
        onImageGenerated();
      }
    } catch (error) {
      console.error("Image edit failed:", error);
    }
  };

  const handleCancel = () => {
    setPendingEdit(null);
    setEditedPrompt("");
    setIsPromptEdited(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Edit cancelled. You can enter a new edit instruction." },
    ]);
  };

  const handleQuickEdit = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-[#333]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#333]">
        <div>
          <h3 className="text-lg font-semibold text-white font-mono">AI Image Editor</h3>
          <p className="text-xs text-gray-400 font-mono">Describe the edit you want in natural language</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Quick Edit Buttons */}
      <div className="p-3 border-b border-[#333]">
        <p className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wider">Quick edits</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_EDIT_BUTTONS.map((btn) => (
            <button
              key={btn.label}
              onClick={() => handleQuickEdit(btn.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] text-xs font-mono font-bold uppercase tracking-wide text-gray-300 hover:text-white transition-colors"
            >
              <span>{btn.icon}</span>
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm font-mono">Enter the edit you want</p>
            <p className="text-xs mt-1 font-mono">For example: &quot;Change the background to a beach&quot;</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-gray-200"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap font-mono">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Pending Edit Confirmation Card */}
        {pendingEdit && (
          <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-xl p-4 border border-blue-500/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-medium text-blue-400 font-mono uppercase tracking-wider">Confirm Edit</span>
            </div>

            {/* Optimized Prompt - Editable */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Optimized Prompt</p>
                {isPromptEdited && (
                  <span className="text-xs text-blue-400 font-mono uppercase tracking-wider">Edited</span>
                )}
              </div>
              <textarea
                value={editedPrompt}
                onChange={(e) => {
                  setEditedPrompt(e.target.value);
                  setIsPromptEdited(true);
                }}
                disabled={isLoading}
                className="w-full text-sm text-gray-300 bg-black/30 rounded-lg p-2 h-20 resize-none border border-transparent focus:border-blue-500/50 focus:outline-none disabled:opacity-50 font-mono"
                placeholder="Enter or edit prompt..."
              />
            </div>

            {/* Edit Type */}
            {pendingEdit.params.edit_type && (
              <div className="mb-3">
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-mono uppercase tracking-wide">
                  {pendingEdit.params.edit_type}
                </span>
              </div>
            )}

            {/* Aspect Ratio Selection */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wider">Output Aspect Ratio</p>
              <div className="flex gap-2">
                {["9:16", "1:1", "16:9"].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setSelectedRatio(ratio)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                      selectedRatio === ratio
                        ? "bg-blue-600 text-white"
                        : "bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-white"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            {pendingEdit.suggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wider">Other suggestions</p>
                <div className="flex flex-wrap gap-2">
                  {pendingEdit.suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(suggestion)}
                      className="text-xs px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#333] font-mono font-bold uppercase tracking-wide text-gray-400 hover:text-white transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-xs font-mono font-bold uppercase tracking-wide text-gray-300 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-xs font-mono font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                {isLoading ? "Generating..." : "Confirm"}
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#333]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputValue);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Describe the edit you want..."
            disabled={isLoading}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 disabled:opacity-50 font-mono"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-mono font-bold uppercase tracking-wide hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    </div>
  );
}
