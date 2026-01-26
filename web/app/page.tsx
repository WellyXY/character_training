"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type {
  Character,
  Image,
  Video,
  ConversationState,
  PendingGeneration,
  GenerationTask,
  ReferenceImageMode,
} from "@/lib/types";
import {
  listCharacters,
  createCharacter,
  listCharacterImages,
  listCharacterVideos,
  approveImage,
  deleteImage,
  deleteVideo,
  agentChat,
  agentConfirm,
  agentCancel,
  agentClear,
  getGenerationTask,
} from "@/lib/api";
import CharacterSidebar from "@/components/CharacterSidebar";
import ContentGallery from "@/components/ContentGallery";
import AgentChatPanel, { ChatMessage } from "@/components/AgentChatPanel";
import AppNavbar from "@/components/AppNavbar";

// Wrapper component to handle Suspense for useSearchParams
function HomeContent() {
  // URL search params for reference image
  const searchParams = useSearchParams();
  const initialReferenceUrl = searchParams.get("ref");

  // State
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [activeTasks, setActiveTasks] = useState<GenerationTask[]>([]);

  // Derived state
  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId]
  );

  const baseImages = useMemo(
    () => images.filter((img) => img.type === "base"),
    [images]
  );

  // Load characters on mount
  useEffect(() => {
    loadCharacters();
  }, []);

  // Load media when character changes
  useEffect(() => {
    if (selectedCharacterId) {
      loadMedia(selectedCharacterId);
    } else {
      setImages([]);
      setVideos([]);
    }
  }, [selectedCharacterId]);

  // Poll active tasks for progress updates
  useEffect(() => {
    // Only poll if there are active tasks and we have a session
    const activePendingTasks = activeTasks.filter(
      (t) => t.status === "pending" || t.status === "generating"
    );
    if (activePendingTasks.length === 0 || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          activePendingTasks.map((t) => getGenerationTask(sessionId, t.task_id))
        );

        setActiveTasks((prev) =>
          prev.map((t) => {
            const updated = updates.find((u) => u.task_id === t.task_id);
            return updated || t;
          })
        );
      } catch (err) {
        console.error("Failed to poll task status:", err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [activeTasks, sessionId]);

  // API calls
  const loadCharacters = async () => {
    try {
      const data = await listCharacters();
      setCharacters(data);
      if (data.length > 0 && !selectedCharacterId) {
        setSelectedCharacterId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load characters");
    }
  };

  const loadMedia = async (characterId: string) => {
    setLoading(true);
    try {
      const [imgs, vids] = await Promise.all([
        listCharacterImages(characterId),
        listCharacterVideos(characterId).catch(() => []),
      ]);
      setImages(imgs);
      setVideos(vids);
      // Remove local tasks (edit/animate) when media is refreshed
      setActiveTasks((prev) => prev.filter(
        (t) => !t.task_id.startsWith("edit-") && !t.task_id.startsWith("animate-")
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  };

  // Character handlers
  const handleCreateCharacter = async (
    name: string,
    description: string,
    gender?: string
  ) => {
    setLoading(true);
    try {
      const created = await createCharacter({ name, description, gender });
      await loadCharacters();
      setSelectedCharacterId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create character");
    } finally {
      setLoading(false);
    }
  };

  // Image handlers
  const handleApproveImage = async (imageId: string) => {
    if (!selectedCharacterId) return;
    setLoading(true);
    try {
      await approveImage(imageId);
      await loadMedia(selectedCharacterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve image");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!selectedCharacterId) return;
    setLoading(true);
    try {
      await deleteImage(imageId);
      await loadMedia(selectedCharacterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!selectedCharacterId) return;
    setLoading(true);
    try {
      await deleteVideo(videoId);
      await loadMedia(selectedCharacterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete video");
    } finally {
      setLoading(false);
    }
  };

  // Chat handlers
  const handleSendMessage = async (message: string, referenceImagePath?: string, referenceImageUrl?: string, referenceImageMode?: ReferenceImageMode) => {
    // If awaiting confirmation, treat input as modification request
    if (conversationState === "awaiting_confirmation" && pendingGeneration && sessionId) {
      return handleConfirm("9:16", message);
    }

    setLoading(true);
    setError(null);
    // Add user message with reference image if present
    setChatMessages((prev) => [...prev, {
      role: "user",
      content: message,
      referenceImageUrl: referenceImageUrl,
    }]);

    try {
      const response = await agentChat({
        message,
        character_id: selectedCharacterId,
        session_id: sessionId,
        reference_image_path: referenceImagePath,
        reference_image_mode: referenceImageMode,
      });

      setSessionId(response.session_id);
      setConversationState(response.state);
      setPendingGeneration(response.pending_generation ?? null);

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.message,
          actionTaken: response.action_taken ?? undefined,
        },
      ]);

      // Reload media if action was taken
      if (response.action_taken && selectedCharacterId) {
        await loadMedia(selectedCharacterId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (aspectRatio: string, modifications?: string, editedPrompt?: string) => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    // If there are modifications, add user message to chat
    if (modifications) {
      setChatMessages((prev) => [...prev, {
        role: "user",
        content: modifications,
      }]);
    }

    try {
      const response = await agentConfirm({
        session_id: sessionId,
        aspect_ratio: aspectRatio,
        modifications: modifications,
        edited_prompt: editedPrompt,
        character_id: selectedCharacterId,
        pending_generation: pendingGeneration,
      });

      setConversationState(response.state);
      setPendingGeneration(response.pending_generation ?? null);

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.message,
          actionTaken: response.action_taken ?? undefined,
        },
      ]);

      // If there's an active background task, add it to tracking
      if (response.active_task) {
        setActiveTasks((prev) => [...prev, response.active_task!]);
      }

      // Only reload media immediately if action was taken synchronously
      // (For background tasks, we'll reload when the task completes)
      if (response.action_taken && selectedCharacterId) {
        await loadMedia(selectedCharacterId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionId) return;
    try {
      await agentCancel(sessionId);
      setConversationState(null);
      setPendingGeneration(null);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Generation task cancelled." },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  const handleClear = async () => {
    if (sessionId) {
      try {
        await agentClear(sessionId);
      } catch {
        // Ignore clear errors
      }
    }
    setChatMessages([]);
    setSessionId(null);
    setConversationState(null);
    setPendingGeneration(null);
    setActiveTasks([]);
  };

  // Task completion handler - reload media and remove task
  const handleTaskComplete = async (taskId: string, resultUrl: string) => {
    // Remove completed task from list (after a short delay to show completion state)
    setTimeout(() => {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    }, 2000);

    // Reload media to show the new content
    if (selectedCharacterId) {
      await loadMedia(selectedCharacterId);
    }

    // Add success message to chat
    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Generation completed successfully!",
        actionTaken: "generated_content",
      },
    ]);
  };

  // Task error handler
  const handleTaskError = (taskId: string, error: string) => {
    // Remove failed task from list (after a short delay)
    setTimeout(() => {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    }, 3000);

    // Add error message to chat
    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Generation failed: ${error}`,
      },
    ]);

    setError(`Generation failed: ${error}`);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <AppNavbar loading={loading} />

      {/* Error Banner */}
      {error && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-red-500/20 border-b border-red-500/30 px-4 py-2">
          <p className="text-sm text-red-300 text-center">{error}</p>
          <button
            onClick={() => setError(null)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="fixed inset-0 pt-14 p-4 overflow-hidden">
        <div className="h-full w-full grid grid-cols-[260px_minmax(0,1fr)_360px] gap-4 min-h-0 max-w-full">
          {/* Left: Character Panel */}
          <CharacterSidebar
            characters={characters}
            selectedCharacter={selectedCharacter}
            baseImages={baseImages}
            onSelect={setSelectedCharacterId}
            onCreate={handleCreateCharacter}
            onApproveImage={handleApproveImage}
            onDeleteImage={handleDeleteImage}
            loading={loading}
          />

          {/* Center: Content Gallery */}
          <ContentGallery
            images={images}
            videos={videos}
            activeTasks={activeTasks}
            onDeleteImage={handleDeleteImage}
            onDeleteVideo={handleDeleteVideo}
            loading={loading}
            characterId={selectedCharacter?.id}
            onVideoCreated={() => {
              if (selectedCharacterId) {
                loadMedia(selectedCharacterId);
              }
            }}
            onRefresh={() => {
              if (selectedCharacterId) {
                loadMedia(selectedCharacterId);
              }
            }}
            onTaskStarted={(task) => {
              const newTask: GenerationTask = {
                task_id: task.task_id,
                status: "generating",
                progress: 10,
                stage: "Processing...",
                prompt: task.prompt,
                reference_image_url: task.reference_image_url,
                result_url: null,
                error: null,
                created_at: new Date().toISOString(),
              };
              setActiveTasks((prev) => [...prev, newTask]);
            }}
          />

          {/* Right: Agent Chat */}
          <AgentChatPanel
            messages={chatMessages}
            sessionId={sessionId}
            conversationState={conversationState}
            pendingGeneration={pendingGeneration}
            activeTasks={activeTasks}
            onSend={handleSendMessage}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onClear={handleClear}
            onTaskComplete={handleTaskComplete}
            onTaskError={handleTaskError}
            loading={loading}
            characterName={selectedCharacter?.name ?? null}
            availableImages={images}
            initialReferenceUrl={initialReferenceUrl}
          />
        </div>
      </div>
    </main>
  );
}

// Main export wrapped in Suspense for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <span className="text-amber-400 animate-pulse">Loading...</span>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
