"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  generateBaseImages,
  deleteCharacter,
} from "@/lib/api";
import CharacterSidebar from "@/components/CharacterSidebar";
import ContentGallery from "@/components/ContentGallery";
import AgentChatPanel, { ChatMessage } from "@/components/AgentChatPanel";
import AppNavbar from "@/components/AppNavbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

// Wrapper component to handle Suspense for useSearchParams
function HomeContent() {
  // URL search params
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const initialReferenceUrl = searchParams.get("ref");
  const initialVideoRefUrl = searchParams.get("videoRef");
  const urlCharacterId = searchParams.get("character");

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

  // Select character: update state, URL, and cookie
  const selectCharacter = useCallback((id: string | null) => {
    setSelectedCharacterId(id);
    if (id) {
      document.cookie = `selectedCharacterId=${id};path=/;max-age=${60 * 60 * 24 * 365}`;
      const params = new URLSearchParams(window.location.search);
      params.set("character", id);
      router.replace(`?${params.toString()}`, { scroll: false });
    } else {
      document.cookie = "selectedCharacterId=;path=/;max-age=0";
      const params = new URLSearchParams(window.location.search);
      params.delete("character");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/", { scroll: false });
    }
  }, [router]);

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
    // Only poll server-tracked tasks (skip locally-created edit/animate tasks)
    const activePendingTasks = activeTasks.filter(
      (t) => (t.status === "pending" || t.status === "generating") &&
        !t.task_id.startsWith("edit-") && !t.task_id.startsWith("animate-") && !t.task_id.startsWith("retry-") && !t.task_id.startsWith("base-")
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

  // Auto-timeout tasks generating for over 60 seconds
  useEffect(() => {
    const activePending = activeTasks.filter(
      (t) => t.status === "pending" || t.status === "generating"
    );
    if (activePending.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      let timedOut = false;
      setActiveTasks((prev) =>
        prev.map((t) => {
          if ((t.status === "pending" || t.status === "generating") &&
              now - new Date(t.created_at).getTime() > 60_000) {
            timedOut = true;
            return { ...t, status: "failed", error: "Generation timed out", progress: 100 };
          }
          return t;
        })
      );
      if (timedOut) {
        // Auto-remove timed-out tasks after 3s
        setTimeout(() => {
          setActiveTasks((prev) => prev.filter((t) => !(t.status === "failed" && t.error === "Generation timed out")));
        }, 3000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTasks]);

  // Poll base image tasks by checking character images
  useEffect(() => {
    const baseTaskIds = activeTasks
      .filter((t) => t.task_id.startsWith("base-") && (t.status === "pending" || t.status === "generating"))
      .map((t) => t.task_id);
    if (baseTaskIds.length === 0 || !selectedCharacterId) return;

    const interval = setInterval(async () => {
      try {
        const imgs = await listCharacterImages(selectedCharacterId);
        const completedTaskIds = new Set(
          imgs
            .filter((img) => img.task_id && (img.status === "completed" || img.status === "failed"))
            .map((img) => img.task_id!)
        );

        const anyDone = baseTaskIds.some((id) => completedTaskIds.has(id));
        if (anyDone) {
          setActiveTasks((prev) =>
            prev.map((t) => {
              if (t.task_id.startsWith("base-") && completedTaskIds.has(t.task_id)) {
                const img = imgs.find((i) => i.task_id === t.task_id);
                if (img?.status === "failed") {
                  return { ...t, status: "failed", error: img.error_message || "Generation failed", progress: 100 };
                }
                return { ...t, status: "completed", progress: 100, result_url: img?.image_url || null };
              }
              return t;
            })
          );
          // Reload media to show new images
          await loadMedia(selectedCharacterId);
          // Auto-remove completed base tasks after delay
          setTimeout(() => {
            setActiveTasks((prev) => prev.filter((t) => !completedTaskIds.has(t.task_id)));
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to poll base image status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTasks, selectedCharacterId]);

  // Poll processing videos for progress/completion
  useEffect(() => {
    const processingVideoIds = videos
      .filter((v) => v.status === "processing")
      .map((v) => v.id);
    if (processingVideoIds.length === 0 || !selectedCharacterId) return;

    const interval = setInterval(async () => {
      try {
        const vids = await listCharacterVideos(selectedCharacterId);
        const hasChange = vids.some((v) => {
          const prev = videos.find((pv) => pv.id === v.id);
          if (!prev) return true;
          // Check if status changed or progress updated
          return prev.status !== v.status ||
            prev.metadata?.progress !== v.metadata?.progress;
        });
        if (hasChange) {
          setVideos(vids);
        }
      } catch (err) {
        console.error("Failed to poll video status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videos, selectedCharacterId]);

  // Helper to handle API errors with token refresh
  const handleApiError = (err: unknown, fallbackMessage: string) => {
    if (err instanceof ApiError) {
      if (err.status === 402) {
        setError("Insufficient tokens. Please contact your administrator for more tokens.");
        refreshUser(); // Refresh user data to update token balance
        return;
      }
    }
    setError(err instanceof Error ? err.message : fallbackMessage);
  };

  // API calls
  const loadCharacters = async () => {
    try {
      const data = await listCharacters();
      setCharacters(data);
      if (data.length > 0 && !selectedCharacterId) {
        // Restore from URL param first, then cookie, then default to first
        const cookieId = document.cookie.match(/selectedCharacterId=([^;]+)/)?.[1];
        const restoreId = urlCharacterId || cookieId;
        const validId = restoreId && data.some((c) => c.id === restoreId) ? restoreId : data[0].id;
        selectCharacter(validId);
      }
    } catch (err) {
      handleApiError(err, "Failed to load characters");
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
      handleApiError(err, "Failed to load media");
    } finally {
      setLoading(false);
    }
  };

  // Character handlers
  const handleCreateCharacter = async (
    name: string,
    description: string,
    gender?: string,
    referenceImagePaths?: string[],
  ) => {
    setLoading(true);
    try {
      const created = await createCharacter({ name, description, gender });
      await loadCharacters();
      selectCharacter(created.id);

      // Auto-generate 3 base images
      try {
        const baseResult = await generateBaseImages(created.id, referenceImagePaths);
        const baseTasks: GenerationTask[] = baseResult.tasks.map((t) => ({
          task_id: t.task_id,
          status: "generating" as const,
          progress: 10,
          stage: "Generating base image...",
          prompt: t.prompt,
          reference_image_url: null,
          result_url: null,
          error: null,
          created_at: new Date().toISOString(),
        }));
        setActiveTasks((prev) => [...prev, ...baseTasks]);
        // Refresh user to update token balance
        refreshUser();
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          setError("Insufficient tokens to generate base images. Please contact your administrator.");
          refreshUser();
        } else {
          console.error("Failed to generate base images:", err);
        }
      }

      // Send welcome message in agent chat
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          content: `Great, **${created.name}** has been created! I'm generating 3 base images (front, 3/4 angle, and side profile) to establish the character's appearance. They'll appear in the gallery shortly.\n\nWhile those generate, you can start describing content images you'd like to create.`,
        },
      ]);
    } catch (err) {
      handleApiError(err, "Failed to create character");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    setLoading(true);
    try {
      await deleteCharacter(characterId);
      selectCharacter(null);
      setImages([]);
      setVideos([]);
      await loadCharacters();
    } catch (err) {
      handleApiError(err, "Failed to delete character");
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
      handleApiError(err, "Failed to approve image");
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
      handleApiError(err, "Failed to delete image");
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
      handleApiError(err, "Failed to delete video");
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
        refreshUser(); // Refresh token balance after action
      }
    } catch (err) {
      handleApiError(err, "Chat failed");
      refreshUser(); // Refresh in case tokens were deducted
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
        refreshUser(); // Refresh token balance after action
      }
    } catch (err) {
      handleApiError(err, "Confirm failed");
      refreshUser(); // Refresh in case tokens were deducted
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
      handleApiError(err, "Cancel failed");
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

  // Cancel/delete a generating task
  const handleCancelTask = async (taskId: string) => {
    // Remove from active tasks
    setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));

    // Find and delete the corresponding DB image by task_id
    if (selectedCharacterId) {
      const matchingImage = images.find((img) => img.task_id === taskId);
      if (matchingImage) {
        try {
          await deleteImage(matchingImage.id);
          await loadMedia(selectedCharacterId);
        } catch (err) {
          console.error("Failed to delete generating image:", err);
        }
      } else {
        // Image might not be in current images list yet, try reloading
        try {
          const allImages = await listCharacterImages(selectedCharacterId);
          const img = allImages.find((i) => i.task_id === taskId);
          if (img) {
            await deleteImage(img.id);
            await loadMedia(selectedCharacterId);
          }
        } catch (err) {
          console.error("Failed to delete generating image:", err);
        }
      }
    }
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
      <div className="fixed inset-0 pt-20 p-4 overflow-hidden">
        <div className="h-full w-full grid grid-cols-[260px_minmax(0,1fr)_360px] gap-4 min-h-0 max-w-full">
          {/* Left: Character Panel */}
          <CharacterSidebar
            characters={characters}
            selectedCharacter={selectedCharacter}
            baseImages={baseImages}
            onSelect={selectCharacter}
            onCreate={handleCreateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onApproveImage={handleApproveImage}
            onDeleteImage={handleDeleteImage}
            onRefresh={() => {
              if (selectedCharacterId) loadMedia(selectedCharacterId);
            }}
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
            onCancelTask={handleCancelTask}
            onTaskUpdate={(taskId, update) => {
              setActiveTasks((prev) =>
                prev.map((t) =>
                  t.task_id === taskId ? { ...t, ...update } : t
                )
              );
              // Auto-remove completed/failed tasks after a delay
              if (update.status === "completed" || update.status === "failed") {
                const delay = update.status === "completed" ? 2000 : 3000;
                setTimeout(() => {
                  setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
                }, delay);
              }
            }}
            initialVideoRef={initialVideoRefUrl}
            onClearVideoRef={() => {
              // Clear videoRef from URL
              const params = new URLSearchParams(window.location.search);
              params.delete("videoRef");
              const qs = params.toString();
              router.replace(qs ? `?${qs}` : "/", { scroll: false });
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

// Main export wrapped in Suspense for useSearchParams and ProtectedRoute
export default function Home() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <span className="text-amber-400 animate-pulse">Loading...</span>
        </div>
      }>
        <HomeContent />
      </Suspense>
    </ProtectedRoute>
  );
}
