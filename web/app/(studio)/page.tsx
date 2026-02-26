"use client";

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  Image,
  Video,
  ConversationState,
  PendingGeneration,
  GenerationTask,
  ReferenceImageMode,
} from "@/lib/types";
import {
  listCharacterImages,
  listCharacterVideos,
  deleteVideo,
  agentChat,
  agentConfirm,
  agentCancel,
  agentClear,
  getGenerationTask,
  generateBaseImages,
  resolveApiUrl,
} from "@/lib/api";
import ContentGallery from "@/components/ContentGallery";
import AgentChatPanel, { ChatMessage } from "@/components/AgentChatPanel";
import StudioRightPanel, { type RightPanelTab } from "@/components/StudioRightPanel";
import ImageGenPanel from "@/components/ImageGenPanel";
import VideoGenPanel from "@/components/VideoGenPanel";
import { useCharacter } from "@/contexts/CharacterContext";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

function GalleryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const {
    selectedCharacterId,
    selectedCharacter,
    handleDeleteImage: ctxDeleteImage,
    onAfterCreate,
    onAfterImageChange,
  } = useCharacter();

  const initialReferenceUrl = searchParams.get("ref");
  const initialVideoRefUrl = searchParams.get("videoRef");
  const initialRefMode = searchParams.get("refMode") as ReferenceImageMode | null;
  const initialRefMsg = searchParams.get("refMsg");

  // Media state
  const [images, setImages] = useState<Image[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Right panel tab state
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>(initialVideoRefUrl ? "video" : "image");
  const [preSelectedVideoImage, setPreSelectedVideoImage] = useState<Image | null>(null);

  // Video reference from community "Apply Ref"
  const [videoRefForPanel, setVideoRefForPanel] = useState<{ url: string; duration: number } | null>(null);
  const [videoRefLoading, setVideoRefLoading] = useState(false);

  useEffect(() => {
    if (initialVideoRefUrl) {
      setRightPanelTab("video");
      setVideoRefLoading(true);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setVideoRefForPanel({ url: initialVideoRefUrl, duration: video.duration || 5 });
        setVideoRefLoading(false);
      };
      video.onerror = () => {
        setVideoRefForPanel({ url: initialVideoRefUrl, duration: 5 });
        setVideoRefLoading(false);
      };
      video.src = resolveApiUrl(initialVideoRefUrl);
    }
  }, [initialVideoRefUrl]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [activeTasks, setActiveTasks] = useState<GenerationTask[]>([]);

  // Sync character param to URL
  useEffect(() => {
    if (selectedCharacterId) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("character") !== selectedCharacterId) {
        params.set("character", selectedCharacterId);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    }
  }, [selectedCharacterId, router]);

  // Register gallery-specific side effects in context
  useEffect(() => {
    onAfterImageChange.current = () => {
      if (selectedCharacterId) loadMedia(selectedCharacterId);
    };
    return () => { onAfterImageChange.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharacterId]);

  useEffect(() => {
    onAfterCreate.current = async (char) => {
      try {
        const baseResult = await generateBaseImages(char.id);
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
        refreshUser();
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          setError("Insufficient tokens to generate base images.");
          refreshUser();
        } else {
          console.error("Failed to generate base images:", err);
        }
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          content: `Great, **${char.name}** has been created! I'm generating 3 base images to establish the character's appearance. They'll appear in the gallery shortly.\n\nWhile those generate, you can start describing content images you'd like to create.`,
        },
      ]);
    };
    return () => { onAfterCreate.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshUser]);

  // Load media when character changes
  useEffect(() => {
    if (selectedCharacterId) {
      loadMedia(selectedCharacterId);
    } else {
      setImages([]);
      setVideos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharacterId]);

  // Auto-trigger generation from Community page ref+mode params
  const autoRefTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoRefTriggeredRef.current || !initialReferenceUrl || !initialRefMode || !selectedCharacterId) return;
    autoRefTriggeredRef.current = true;

    // Clean URL params
    const params = new URLSearchParams(window.location.search);
    params.delete("ref");
    params.delete("refMode");
    params.delete("refMsg");
    router.replace(`?${params.toString()}`, { scroll: false });

    // Call agentChat directly to avoid stale closure issues
    const refUrl = initialReferenceUrl;
    const refMode = initialRefMode;
    const refMsg = initialRefMsg || "";
    const charId = selectedCharacterId;

    // Show a placeholder task immediately for instant visual feedback
    const placeholderId = `placeholder-${Date.now()}`;
    const placeholderTask: GenerationTask = {
      task_id: placeholderId,
      status: "generating",
      progress: 5,
      stage: "Preparing generation...",
      prompt: refMsg || "Applying reference...",
      reference_image_url: refUrl,
      result_url: null,
      error: null,
      created_at: new Date().toISOString(),
    };
    setActiveTasks((prev) => [...prev, placeholderTask]);

    (async () => {
      setLoading(true);
      setChatMessages((prev) => [...prev, { role: "user" as const, content: refMsg || "(Apply reference)" }]);
      try {
        // Step 1: agentChat to get the prompt/pending generation
        const chatResponse = await agentChat({
          message: refMsg,
          character_id: charId,
          session_id: null,
          reference_image_path: refUrl,
          reference_image_mode: refMode,
        });
        setSessionId(chatResponse.session_id);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant" as const, content: chatResponse.message, actionTaken: chatResponse.action_taken ?? undefined },
        ]);

        // Step 2: If awaiting confirmation, auto-confirm to start generation immediately
        if (chatResponse.state === "awaiting_confirmation" && chatResponse.pending_generation && chatResponse.session_id) {
          const confirmResponse = await agentConfirm({
            session_id: chatResponse.session_id,
            aspect_ratio: "9:16",
            character_id: charId,
            pending_generation: chatResponse.pending_generation,
          });
          setConversationState(confirmResponse.state);
          setPendingGeneration(confirmResponse.pending_generation ?? null);
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content: confirmResponse.message, actionTaken: confirmResponse.action_taken ?? undefined },
          ]);
          // Replace placeholder with real task
          if (confirmResponse.active_task) {
            setActiveTasks((prev) =>
              prev
                .filter((t) => t.task_id !== placeholderId)
                .concat(confirmResponse.active_task!)
            );
          } else {
            // No real task returned - remove placeholder
            setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
          }
          if (confirmResponse.action_taken && charId) {
            await loadMedia(charId);
            refreshUser();
          }
        } else {
          // Already generated directly - remove placeholder
          setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
          setConversationState(chatResponse.state);
          setPendingGeneration(chatResponse.pending_generation ?? null);
          if (chatResponse.action_taken && charId) {
            await loadMedia(charId);
            refreshUser();
          }
        }
      } catch (err) {
        // Remove placeholder on error
        setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
        setError(err instanceof Error ? err.message : "Generation failed");
        refreshUser();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReferenceUrl, initialRefMode, selectedCharacterId]);

  // Poll active tasks
  useEffect(() => {
    const activePendingTasks = activeTasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "generating") &&
        !t.task_id.startsWith("edit-") &&
        !t.task_id.startsWith("animate-") &&
        !t.task_id.startsWith("retry-") &&
        !t.task_id.startsWith("base-") &&
        !t.task_id.startsWith("placeholder-")
    );
    if (activePendingTasks.length === 0 || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          activePendingTasks.map((t) => getGenerationTask(sessionId, t.task_id))
        );

        // Detect newly completed/failed tasks
        const completedIds: string[] = [];
        const failedIds: string[] = [];
        for (const u of updates) {
          const prev = activePendingTasks.find((t) => t.task_id === u.task_id);
          if (prev && (prev.status === "pending" || prev.status === "generating")) {
            if (u.status === "completed") completedIds.push(u.task_id);
            else if (u.status === "failed") failedIds.push(u.task_id);
          }
        }

        setActiveTasks((prev) =>
          prev.map((t) => updates.find((u) => u.task_id === t.task_id) || t)
        );

        // Auto-refresh gallery when tasks complete (works regardless of active tab)
        if (completedIds.length > 0 && selectedCharacterId) {
          await loadMedia(selectedCharacterId);
          refreshUser();
          // Auto-remove completed tasks after a delay
          setTimeout(() => {
            setActiveTasks((prev) => prev.filter((t) => !completedIds.includes(t.task_id)));
          }, 2000);
        }
        if (failedIds.length > 0) {
          setTimeout(() => {
            setActiveTasks((prev) => prev.filter((t) => !failedIds.includes(t.task_id)));
          }, 3000);
        }
      } catch (err) {
        console.error("Failed to poll task status:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks, sessionId, selectedCharacterId]);

  // Auto-timeout tasks over 60s
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
          if (
            (t.status === "pending" || t.status === "generating") &&
            now - new Date(t.created_at).getTime() > 60_000
          ) {
            timedOut = true;
            return { ...t, status: "failed", error: "Generation timed out", progress: 100 };
          }
          return t;
        })
      );
      if (timedOut) {
        setTimeout(() => {
          setActiveTasks((prev) =>
            prev.filter(
              (t) => !(t.status === "failed" && t.error === "Generation timed out")
            )
          );
        }, 3000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTasks]);

  // Poll base image tasks
  useEffect(() => {
    const baseTaskIds = activeTasks
      .filter(
        (t) =>
          t.task_id.startsWith("base-") &&
          (t.status === "pending" || t.status === "generating")
      )
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
          await loadMedia(selectedCharacterId);
          setTimeout(() => {
            setActiveTasks((prev) => prev.filter((t) => !completedTaskIds.has(t.task_id)));
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to poll base image status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks, selectedCharacterId]);

  // Poll processing videos
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
          return prev.status !== v.status || prev.metadata?.progress !== v.metadata?.progress;
        });
        if (hasChange) setVideos(vids);
      } catch (err) {
        console.error("Failed to poll video status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videos, selectedCharacterId]);

  // Poll generating images
  useEffect(() => {
    const generatingImageIds = images
      .filter((img) => img.status === "generating")
      .map((img) => img.id);
    if (generatingImageIds.length === 0 || !selectedCharacterId) return;

    const interval = setInterval(async () => {
      try {
        const imgs = await listCharacterImages(selectedCharacterId);
        const hasChange = imgs.some((img) => {
          const prev = images.find((p) => p.id === img.id);
          if (!prev) return true;
          return prev.status === "generating" && img.status !== "generating";
        });
        if (hasChange) {
          setImages(imgs);
          refreshUser();
        }
      } catch (err) {
        console.error("Failed to poll generating image status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [images, selectedCharacterId, refreshUser]);

  const handleApiError = (err: unknown, fallbackMessage: string) => {
    if (err instanceof ApiError && err.status === 402) {
      setError("Insufficient tokens. Please contact your administrator for more tokens.");
      refreshUser();
      return;
    }
    setError(err instanceof Error ? err.message : fallbackMessage);
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
      setActiveTasks((prev) =>
        prev.filter(
          (t) => !t.task_id.startsWith("edit-") && !t.task_id.startsWith("animate-")
        )
      );
    } catch (err) {
      handleApiError(err, "Failed to load media");
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

  const handleSendMessage = async (
    message: string,
    referenceImagePath?: string,
    referenceImageUrl?: string,
    referenceImageMode?: ReferenceImageMode
  ) => {
    if (conversationState === "awaiting_confirmation" && pendingGeneration && sessionId) {
      return handleConfirm("9:16", message);
    }

    setLoading(true);
    setError(null);
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: message, referenceImageUrl },
    ]);

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
        { role: "assistant", content: response.message, actionTaken: response.action_taken ?? undefined },
      ]);

      if (response.action_taken && selectedCharacterId) {
        await loadMedia(selectedCharacterId);
        refreshUser();
      }
    } catch (err) {
      handleApiError(err, "Chat failed");
      refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (
    aspectRatio: string,
    modifications?: string,
    editedPrompt?: string
  ) => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    if (modifications) {
      setChatMessages((prev) => [...prev, { role: "user", content: modifications }]);
    }

    try {
      const response = await agentConfirm({
        session_id: sessionId,
        aspect_ratio: aspectRatio,
        modifications,
        edited_prompt: editedPrompt,
        character_id: selectedCharacterId,
        pending_generation: pendingGeneration,
      });

      setConversationState(response.state);
      setPendingGeneration(response.pending_generation ?? null);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.message, actionTaken: response.action_taken ?? undefined },
      ]);

      if (response.active_task) {
        setActiveTasks((prev) => [...prev, response.active_task!]);
      }

      if (response.action_taken && selectedCharacterId) {
        await loadMedia(selectedCharacterId);
        refreshUser();
      }
    } catch (err) {
      handleApiError(err, "Confirm failed");
      refreshUser();
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
      try { await agentClear(sessionId); } catch { /* ignore */ }
    }
    setChatMessages([]);
    setSessionId(null);
    setConversationState(null);
    setPendingGeneration(null);
    setActiveTasks([]);
  };

  const handleTaskComplete = async (taskId: string, _resultUrl: string) => {
    setTimeout(() => {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    }, 2000);
    if (selectedCharacterId) await loadMedia(selectedCharacterId);
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Generation completed successfully!", actionTaken: "generated_content" },
    ]);
  };

  // ImageGenPanel-specific task completion — does NOT auto-refresh gallery
  const handleImageGenTaskComplete = (taskId: string, _resultUrl: string) => {
    setTimeout(() => {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    }, 500);
  };

  // Called when user clicks "Save to Gallery" in ImageGenPanel
  const handleSaveToGallery = async () => {
    if (selectedCharacterId) {
      await loadMedia(selectedCharacterId);
      refreshUser();
    }
  };

  const handleTaskError = (taskId: string, error: string) => {
    setTimeout(() => {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    }, 3000);
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: `Generation failed: ${error}` },
    ]);
    setError(`Generation failed: ${error}`);
  };

  // Handle "Make Video" from gallery - switch to video tab
  const handleMakeVideo = useCallback((image: Image) => {
    setPreSelectedVideoImage(image);
    setRightPanelTab("video");
  }, []);

  // Handle image generation from ImageGenPanel
  const handleImageGenerate = async (
    message: string,
    aspectRatio: string,
    referenceImagePath?: string,
    referenceImageMode?: ReferenceImageMode
  ) => {
    if (!selectedCharacterId) return;

    // Add placeholder task immediately for instant gallery feedback
    const placeholderId = `placeholder-${Date.now()}`;
    setActiveTasks((prev) => [
      ...prev,
      {
        task_id: placeholderId,
        status: "generating" as const,
        progress: 5,
        stage: "Preparing...",
        prompt: message,
        reference_image_url: referenceImagePath || null,
        result_url: null,
        error: null,
        created_at: new Date().toISOString(),
      },
    ]);

    setLoading(true);
    setError(null);
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      // Step 1: agentChat to get pending generation
      const chatResponse = await agentChat({
        message,
        character_id: selectedCharacterId,
        session_id: sessionId,
        reference_image_path: referenceImagePath,
        reference_image_mode: referenceImageMode,
      });

      setSessionId(chatResponse.session_id);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: chatResponse.message, actionTaken: chatResponse.action_taken ?? undefined },
      ]);

      // Step 2: Auto-confirm if awaiting confirmation
      if (chatResponse.state === "awaiting_confirmation" && chatResponse.pending_generation && chatResponse.session_id) {
        const confirmResponse = await agentConfirm({
          session_id: chatResponse.session_id,
          aspect_ratio: aspectRatio,
          character_id: selectedCharacterId,
          pending_generation: chatResponse.pending_generation,
        });

        setConversationState(confirmResponse.state);
        setPendingGeneration(confirmResponse.pending_generation ?? null);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: confirmResponse.message, actionTaken: confirmResponse.action_taken ?? undefined },
        ]);

        if (confirmResponse.active_task) {
          // Replace placeholder with real task
          setActiveTasks((prev) => [
            ...prev.filter((t) => t.task_id !== placeholderId),
            confirmResponse.active_task!,
          ]);
        } else {
          setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
        }

        if (confirmResponse.action_taken) {
          refreshUser();
        }
      } else {
        // Remove placeholder — no real task to show
        setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
        setConversationState(chatResponse.state);
        setPendingGeneration(chatResponse.pending_generation ?? null);
        if (chatResponse.action_taken) {
          refreshUser();
          refreshUser();
        }
      }
    } catch (err) {
      setActiveTasks((prev) => prev.filter((t) => t.task_id !== placeholderId));
      handleApiError(err, "Generation failed");
      refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    if (selectedCharacterId) {
      const matchingImage = images.find((img) => img.task_id === taskId);
      if (matchingImage) {
        try {
          await ctxDeleteImage(matchingImage.id);
          await loadMedia(selectedCharacterId);
        } catch (err) {
          console.error("Failed to delete generating image:", err);
        }
      }
    }
  };

  return (
    <>
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

      <div className="h-full grid grid-cols-[minmax(0,1fr)_360px] gap-4 min-h-0">
        <ContentGallery
          images={images}
          videos={videos}
          activeTasks={activeTasks}
          onDeleteImage={async (id) => { try { await ctxDeleteImage(id); if (selectedCharacterId) await loadMedia(selectedCharacterId); } catch (err) { console.error("Delete image failed:", err); } }}
          onDeleteVideo={handleDeleteVideo}
          loading={loading}
          characterId={selectedCharacter?.id}
          onVideoCreated={() => { if (selectedCharacterId) loadMedia(selectedCharacterId); }}
          onRefresh={() => { if (selectedCharacterId) loadMedia(selectedCharacterId); }}
          onTokenRefresh={refreshUser}
          onTaskStarted={(task) => {
            setActiveTasks((prev) => [
              ...prev,
              {
                task_id: task.task_id,
                status: "generating",
                progress: 10,
                stage: "Processing...",
                prompt: task.prompt,
                reference_image_url: task.reference_image_url,
                result_url: null,
                error: null,
                created_at: new Date().toISOString(),
              },
            ]);
          }}
          onCancelTask={handleCancelTask}
          onTaskUpdate={(taskId, update) => {
            setActiveTasks((prev) =>
              prev.map((t) => (t.task_id === taskId ? { ...t, ...update } : t))
            );
            if (update.status === "completed" || update.status === "failed") {
              const delay = update.status === "completed" ? 2000 : 3000;
              setTimeout(() => {
                setActiveTasks((prev) => prev.filter((t) => t.task_id !== taskId));
              }, delay);
            }
          }}
          initialVideoRef={initialVideoRefUrl}
          onClearVideoRef={() => {
            const params = new URLSearchParams(window.location.search);
            params.delete("videoRef");
            const qs = params.toString();
            router.replace(qs ? `?${qs}` : "/", { scroll: false });
          }}
          onMakeVideo={handleMakeVideo}
        />

        <StudioRightPanel
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          characterName={selectedCharacter?.name ?? null}
          imageGenPanel={
            <ImageGenPanel
              characterId={selectedCharacterId}
              availableImages={images}
              activeTasks={activeTasks}
              onGenerate={handleImageGenerate}
              onTaskComplete={handleImageGenTaskComplete}
              onTaskError={handleTaskError}
              onSaveToGallery={handleSaveToGallery}
              loading={loading}
            />
          }
          videoGenPanel={
            <VideoGenPanel
              characterId={selectedCharacterId}
              availableImages={images}
              preSelectedImage={preSelectedVideoImage}
              onClearPreSelected={() => setPreSelectedVideoImage(null)}
              onVideoCreated={() => { if (selectedCharacterId) loadMedia(selectedCharacterId); }}
              initialReferenceVideo={videoRefForPanel}
              initialReferenceVideoLoading={videoRefLoading}
              onClearInitialReferenceVideo={() => { setVideoRefForPanel(null); setVideoRefLoading(false); }}
              onTaskStarted={(task) => {
                setActiveTasks((prev) => [
                  ...prev,
                  {
                    task_id: task.task_id,
                    status: "generating",
                    progress: 10,
                    stage: "Processing...",
                    prompt: task.prompt,
                    reference_image_url: task.reference_image_url,
                    result_url: null,
                    error: null,
                    created_at: new Date().toISOString(),
                  },
                ]);
              }}
            />
          }
          assistantPanel={
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
              initialReferenceUrl={initialRefMode ? undefined : initialReferenceUrl}
              hideHeader
            />
          }
        />
      </div>
    </>
  );
}

export default function GalleryPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <span className="text-white animate-pulse">Loading...</span>
        </div>
      }
    >
      <GalleryContent />
    </Suspense>
  );
}
