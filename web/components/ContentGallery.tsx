"use client";

import { useState, useMemo, useEffect } from "react";
import type { Image, Video, GenerationTask } from "@/lib/types";
import { resolveApiUrl, retryImage, retryVideo, setImageAsBase } from "@/lib/api";
import AnimateModal from "./AnimateModal";
import ImageEditPanel from "./ImageEditPanel";

interface ContentGalleryProps {
  images: Image[];
  videos: Video[];
  activeTasks?: GenerationTask[];
  onDeleteImage: (imageId: string) => Promise<void>;
  onDeleteVideo: (videoId: string) => Promise<void>;
  loading: boolean;
  characterId?: string | null;
  onVideoCreated?: () => void;
  onRefresh?: () => void;
  onTaskStarted?: (task: { task_id: string; prompt: string; reference_image_url?: string }) => void;
  onTaskUpdate?: (taskId: string, update: Partial<GenerationTask>) => void;
  onCancelTask?: (taskId: string) => void;
  initialVideoRef?: string | null;
  onClearVideoRef?: () => void;
}

type TabType = "all" | "base" | "images" | "videos";

export default function ContentGallery({
  images,
  videos,
  activeTasks = [],
  onDeleteImage,
  onDeleteVideo,
  loading,
  characterId,
  onVideoCreated,
  onRefresh,
  onTaskStarted,
  onTaskUpdate,
  onCancelTask,
  initialVideoRef,
  onClearVideoRef,
}: ContentGalleryProps) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selectedItem, setSelectedItem] = useState<{
    type: "image" | "video";
    url: string;
    prompt?: string;
    image?: Image;
    video?: Video;
    editMode?: boolean;
  } | null>(null);
  const [animatingImage, setAnimatingImage] = useState<Image | null>(null);
  const [videoRefForAnimate, setVideoRefForAnimate] = useState<{ url: string; duration: number } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Handle initial video reference from URL
  useEffect(() => {
    if (initialVideoRef) {
      // Get video duration
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setVideoRefForAnimate({ url: initialVideoRef, duration: video.duration || 5 });
      };
      video.onerror = () => {
        setVideoRefForAnimate({ url: initialVideoRef, duration: 5 });
      };
      video.src = resolveApiUrl(initialVideoRef);
    } else {
      setVideoRefForAnimate(null);
    }
  }, [initialVideoRef]);

  // Helper function to get readable aspect ratio
  const getAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    // Common aspect ratios with tolerance
    const commonRatios = [
      { w: 9, h: 16, label: "9:16" },
      { w: 16, h: 9, label: "16:9" },
      { w: 1, h: 1, label: "1:1" },
      { w: 4, h: 3, label: "4:3" },
      { w: 3, h: 4, label: "3:4" },
      { w: 3, h: 2, label: "3:2" },
      { w: 2, h: 3, label: "2:3" },
      { w: 21, h: 9, label: "21:9" },
    ];

    for (const common of commonRatios) {
      const commonRatio = common.w / common.h;
      if (Math.abs(ratio - commonRatio) < 0.05) {
        return common.label;
      }
    }

    // Fallback: show decimal ratio
    return ratio > 1
      ? `${ratio.toFixed(2)}:1`
      : `1:${(1/ratio).toFixed(2)}`;
  };

  // Handle image click - either open preview or animate modal if in video ref mode
  const handleImageClick = (img: Image) => {
    if (videoRefForAnimate && characterId) {
      // Video ref mode: directly open animate modal
      setAnimatingImage(img);
    } else {
      // Normal mode: open preview
      setSelectedItem({
        type: "image",
        url: resolveApiUrl(img.image_url!),
        prompt: img.metadata?.prompt,
        image: img,
      });
    }
  };

  // Sort images and videos by creation time (newest first)
  const sortedImages = useMemo(
    () => [...images].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [images]
  );

  const sortedVideos = useMemo(
    () => [...videos].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [videos]
  );

  // Filter out generating images to show them separately with spinner
  const generatingImages = sortedImages.filter((img) => img.status === "generating");
  const completedImages = sortedImages.filter((img) => img.status !== "generating");

  // Filter out processing videos to show them separately with spinner
  const processingVideos = sortedVideos.filter((v) => v.status === "processing" || !v.video_url);
  const completedVideos = sortedVideos.filter((v) => v.status !== "processing" && v.video_url);

  // Filter images by type (from completed list)
  const baseImages = completedImages.filter((img) => img.type === "base");
  const contentImages = completedImages.filter((img) => img.type !== "base");

  // Combined and sorted list for "all" tab (completed images + completed videos sorted by created_at)
  type ContentItem = { type: "image"; data: Image } | { type: "video"; data: Video };
  const allContentSorted = useMemo<ContentItem[]>(() => {
    const items: ContentItem[] = [
      ...completedImages.map((img): ContentItem => ({ type: "image", data: img })),
      ...completedVideos.map((vid): ContentItem => ({ type: "video", data: vid })),
    ];
    return items.sort((a, b) =>
      new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime()
    );
  }, [completedImages, completedVideos]);

  // Filter active tasks (pending or generating)
  const pendingTasks = activeTasks.filter(
    (t) => t.status === "pending" || t.status === "generating"
  );

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "all", label: "All", count: completedImages.length + sortedVideos.length + pendingTasks.length + generatingImages.length + processingVideos.length },
    { key: "base", label: "Base", count: baseImages.length },
    { key: "images", label: "Content", count: contentImages.length },
    { key: "videos", label: "Videos", count: sortedVideos.length },
  ];

  const handleRetryImage = async (imageId: string) => {
    if (loading) return;

    // Find the image to get its metadata for display
    const img = images.find((i) => i.id === imageId);
    const taskId = `retry-image-${Date.now()}`;

    // Show generating task immediately
    if (onTaskStarted) {
      onTaskStarted({
        task_id: taskId,
        prompt: img?.metadata?.prompt || "Retrying image...",
        reference_image_url: img?.image_url ?? undefined,
      });
    }

    // Run retry in background
    try {
      await retryImage(imageId);
      // Mark task as completed
      if (onTaskUpdate) {
        onTaskUpdate(taskId, {
          status: "completed" as GenerationTask["status"],
          progress: 100,
          stage: "completed",
        });
      }
      await onRefresh?.();
    } catch (err) {
      console.error("Retry image failed:", err);
      const message = err instanceof Error ? err.message : "Retry failed";
      if (onTaskUpdate) {
        onTaskUpdate(taskId, {
          status: "failed" as GenerationTask["status"],
          progress: 0,
          stage: "failed",
          error: message,
        });
      }
    }
  };

  const handleRetryVideo = async (videoId: string) => {
    if (loading) return;

    const video = videos.find((v) => v.id === videoId);
    const taskId = `retry-video-${Date.now()}`;

    if (onTaskStarted) {
      onTaskStarted({
        task_id: taskId,
        prompt: video?.metadata?.prompt || "Retrying video...",
        reference_image_url: video?.thumbnail_url ?? undefined,
      });
    }

    try {
      await retryVideo(videoId);
      if (onTaskUpdate) {
        onTaskUpdate(taskId, {
          status: "completed" as GenerationTask["status"],
          progress: 100,
          stage: "completed",
        });
      }
      await onRefresh?.();
    } catch (err) {
      console.error("Retry video failed:", err);
      const message = err instanceof Error ? err.message : "Retry failed";
      if (onTaskUpdate) {
        onTaskUpdate(taskId, {
          status: "failed" as GenerationTask["status"],
          progress: 0,
          stage: "failed",
          error: message,
        });
      }
    }
  };

  return (
    <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
      {/* Header */}
      <div className="mb-4">
        <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
          Gallery
        </p>
        <h2 className="text-lg font-semibold font-mono">Generated Content</h2>
      </div>

      {/* Tabs */}
      <div className="flex flex-row gap-2 mb-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono uppercase tracking-wide transition-colors ${
                isActive
                  ? "bg-white text-black"
                  : "bg-[#1a1a1a] text-gray-400 border border-[#333] hover:text-white"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* Video Reference Mode Banner */}
      {videoRefForAnimate && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-amber-200 font-mono">Select an image to animate with reference video</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setVideoRefForAnimate(null);
              onClearVideoRef?.();
            }}
            className="text-amber-400 hover:text-amber-200 text-sm font-mono"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {completedImages.length === 0 && sortedVideos.length === 0 && pendingTasks.length === 0 && generatingImages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <p className="text-sm font-mono">No content generated yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Generating Tasks (from memory) */}
            {activeTab === "all" &&
              pendingTasks.map((task) => (
                <div
                  key={task.task_id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex flex-col"
                >
                  {/* Reference Image Preview (if available) */}
                  {task.reference_image_url && (
                    <div className="absolute inset-0 opacity-30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveApiUrl(task.reference_image_url)}
                        alt="Reference"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
                    {/* Spinner */}
                    <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />

                    {/* Status */}
                    <p className="text-sm font-medium text-blue-400 mb-1 font-mono uppercase tracking-wide">
                      {task.stage || (task.status === "pending" ? "Queued..." : "Generating...")}
                    </p>

                    {/* Progress Bar */}
                    <div className="w-full max-w-[120px] h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>

                    {/* Prompt Preview */}
                    {task.prompt && (
                      <p className="text-[10px] text-gray-400 text-center line-clamp-3 px-2 font-mono">
                        {task.prompt}
                      </p>
                    )}
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2 z-20">
                    <span className="rounded-full bg-blue-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm flex items-center gap-1 font-mono uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Generating
                    </span>
                  </div>

                  {/* Cancel Button */}
                  {onCancelTask && (
                    <div className="absolute bottom-2 right-2 z-20">
                      <button
                        type="button"
                        onClick={() => onCancelTask(task.task_id)}
                        className="rounded-full bg-red-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm hover:bg-red-500/80"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {/* Generating Images (from database - persisted) */}
            {activeTab === "all" &&
              generatingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex flex-col"
                >
                  {/* Content */}
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
                    {/* Spinner */}
                    <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />

                    {/* Status */}
                    <p className="text-sm font-medium text-blue-400 mb-1 font-mono uppercase tracking-wide">
                      Generating...
                    </p>

                    {/* Progress Bar (indeterminate) */}
                    <div className="w-full max-w-[120px] h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div className="h-full w-1/3 bg-blue-500 animate-[slide_1.5s_ease-in-out_infinite]" />
                    </div>

                    {/* Prompt Preview */}
                    {img.metadata?.prompt && (
                      <p className="text-[10px] text-gray-400 text-center line-clamp-3 px-2 font-mono">
                        {img.metadata.prompt}
                      </p>
                    )}
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2 z-20">
                    <span className="rounded-full bg-blue-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm flex items-center gap-1 font-mono uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      {img.type === "base" ? "Base" : "Content"}
                    </span>
                  </div>

                  {/* Delete button */}
                  <div className="absolute bottom-2 right-2 z-20">
                    <button
                      type="button"
                      onClick={() => onDeleteImage(img.id)}
                      className="rounded-full bg-red-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm hover:bg-red-500/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}

            {/* Processing Videos (from database - persisted) */}
            {activeTab === "all" &&
              processingVideos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex flex-col"
                >
                  {/* Content */}
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
                    {/* Spinner */}
                    <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />

                    {/* Status */}
                    <p className="text-sm font-medium text-amber-400 mb-1 font-mono uppercase tracking-wide">
                      Processing...
                    </p>

                    {/* Progress Bar (indeterminate) */}
                    <div className="w-full max-w-[120px] h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div className="h-full w-1/3 bg-amber-500 animate-[slide_1.5s_ease-in-out_infinite]" />
                    </div>

                    {/* Prompt Preview */}
                    {(video.metadata?.original_prompt || video.metadata?.prompt) && (
                      <p className="text-[10px] text-gray-400 text-center line-clamp-3 px-2 font-mono">
                        {video.metadata.original_prompt || video.metadata.prompt}
                      </p>
                    )}
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2 z-20">
                    <span className="rounded-full bg-amber-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm flex items-center gap-1 font-mono uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Video
                    </span>
                  </div>

                  {/* Delete button */}
                  <div className="absolute bottom-2 right-2 z-20">
                    <button
                      type="button"
                      onClick={() => onDeleteVideo(video.id)}
                      className="rounded-full bg-red-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm hover:bg-red-500/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}

            {/* All Content (sorted by time) */}
            {activeTab === "all" &&
              allContentSorted.map((item) =>
                item.type === "image" && item.data.image_url ? (
                  <div
                    key={item.data.id}
                    className={`relative aspect-[9/16] overflow-hidden rounded-xl border bg-[#0b0b0b] group cursor-pointer ${
                      item.data.status === "failed" ? "border-red-500/30" : "border-white/10"
                    }`}
                    onClick={() => handleImageClick(item.data)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveApiUrl(item.data.image_url!)}
                      alt="Generated"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto">
                      {item.data.metadata?.prompt && (
                        <p className="text-[10px] text-gray-200 line-clamp-4 mb-1 font-mono">
                          {item.data.metadata.prompt}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {characterId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem({
                                type: "image",
                                url: resolveApiUrl(item.data.image_url!),
                                prompt: item.data.metadata?.prompt,
                                image: item.data,
                                editMode: true,
                              });
                            }}
                            disabled={loading}
                            className="flex-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-black hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                          >
                            Edit
                          </button>
                        )}
                        {characterId && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAnimatingImage(item.data); }}
                            disabled={loading}
                            className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                          >
                            Animate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRetryImage(item.data.id); }}
                          disabled={loading || retryingId === `image:${item.data.id}`}
                          className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          {retryingId === `image:${item.data.id}` ? "Retrying..." : "Retry"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteImage(item.data.id); }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] text-white backdrop-blur-sm ${
                        item.data.type === "base" ? "bg-green-500/50" : "bg-white/20"
                      } font-mono uppercase tracking-wide`}>
                        {item.data.type === "base" ? "Base" : item.data.type === "content" ? "Content" : item.data.type}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.data.id}
                    className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0b] group cursor-pointer"
                    onClick={() =>
                      setSelectedItem({
                        type: "video",
                        url: resolveApiUrl((item.data as Video).video_url!),
                        prompt: (item.data as Video).metadata?.original_prompt || item.data.metadata?.prompt,
                        video: item.data as Video,
                      })
                    }
                  >
                    {(item.data as Video).thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveApiUrl((item.data as Video).thumbnail_url!)} alt="Video thumbnail" className="h-full w-full object-cover" />
                    ) : (
                      <video src={resolveApiUrl((item.data as Video).video_url!)} className="h-full w-full object-cover" muted />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center group-hover:opacity-50 transition-opacity">
                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto">
                      {item.data.metadata?.prompt && (
                        <p className="text-[10px] text-gray-200 line-clamp-4 mb-1 font-mono">{item.data.metadata.prompt}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRetryVideo(item.data.id); }}
                          disabled={loading || retryingId === `video:${item.data.id}`}
                          className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          {retryingId === `video:${item.data.id}` ? "Retrying..." : "Retry"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteVideo(item.data.id); }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className="rounded-full bg-blue-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm font-mono uppercase tracking-wide">{item.data.type}</span>
                    </div>
                    {item.data.status !== "completed" && (
                      <div className="absolute top-2 right-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] backdrop-blur-sm ${
                          item.data.status === "processing" ? "bg-amber-500/50 text-white"
                            : item.data.status === "failed" ? "bg-red-500/50 text-white" : "bg-gray-500/50 text-white"
                        } font-mono uppercase tracking-wide`}>{item.data.status}</span>
                      </div>
                    )}
                  </div>
                )
              )}

            {/* Base Images (only for base tab) */}
            {activeTab === "base" &&
              baseImages.filter(img => img.image_url).map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0b] group cursor-pointer"
                  onClick={() => handleImageClick(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(img.image_url!)}
                    alt="Base"
                    className="h-full w-full object-cover"
                  />

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto">
                    {img.metadata?.prompt && (
                      <p className="text-[10px] text-gray-200 line-clamp-4 mb-1 font-mono">
                        {img.metadata.prompt}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {characterId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem({
                              type: "image",
                              url: resolveApiUrl(img.image_url!),
                              prompt: img.metadata?.prompt,
                              image: img,
                              editMode: true,
                            });
                          }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-black hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Edit
                        </button>
                      )}
                      {characterId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnimatingImage(img);
                          }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Animate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryImage(img.id);
                        }}
                        disabled={loading || retryingId === `image:${img.id}`}
                        className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        {retryingId === `image:${img.id}` ? "Retrying..." : "Retry"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img.id);
                        }}
                        disabled={loading}
                        className="flex-1 rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Type Badge - Green for Base */}
                  <div className="absolute top-2 left-2">
                    <span className="rounded-full bg-green-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm font-mono uppercase tracking-wide">
                      Base
                    </span>
                  </div>
                </div>
              ))}

            {/* Content Images (only for images tab) */}
            {activeTab === "images" &&
              contentImages.filter(img => img.image_url).map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0b] group cursor-pointer"
                  onClick={() => handleImageClick(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveApiUrl(img.image_url!)}
                    alt="Generated"
                    className="h-full w-full object-cover"
                  />

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto">
                    {img.metadata?.prompt && (
                      <p className="text-[10px] text-gray-200 line-clamp-4 mb-1 font-mono">
                        {img.metadata.prompt}
                      </p>
                    )}
                    {!img.metadata?.prompt && img.metadata?.style && (
                      <span className="text-[10px] text-gray-300 mb-1 font-mono">
                        {img.metadata.style}
                      </span>
                    )}
                    <div className="flex gap-2 mt-2">
                      {characterId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem({
                              type: "image",
                              url: resolveApiUrl(img.image_url!),
                              prompt: img.metadata?.prompt,
                              image: img,
                              editMode: true,
                            });
                          }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-black hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Edit
                        </button>
                      )}
                      {characterId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnimatingImage(img);
                          }}
                          disabled={loading}
                          className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                        >
                          Animate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryImage(img.id);
                        }}
                        disabled={loading || retryingId === `image:${img.id}`}
                        className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        {retryingId === `image:${img.id}` ? "Retrying..." : "Retry"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img.id);
                        }}
                        disabled={loading}
                        className="flex-1 rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2">
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm font-mono uppercase tracking-wide">
                      {img.type === "content" ? "Content" : img.type}
                    </span>
                  </div>
                </div>
              ))}

            {/* Processing Videos (for videos tab) */}
            {activeTab === "videos" &&
              processingVideos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex flex-col"
                >
                  {/* Content */}
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">
                    {/* Spinner */}
                    <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />

                    {/* Status */}
                    <p className="text-sm font-medium text-amber-400 mb-1 font-mono uppercase tracking-wide">
                      Processing...
                    </p>

                    {/* Progress Bar (indeterminate) */}
                    <div className="w-full max-w-[120px] h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div className="h-full w-1/3 bg-amber-500 animate-[slide_1.5s_ease-in-out_infinite]" />
                    </div>

                    {/* Prompt Preview */}
                    {(video.metadata?.original_prompt || video.metadata?.prompt) && (
                      <p className="text-[10px] text-gray-400 text-center line-clamp-3 px-2 font-mono">
                        {video.metadata.original_prompt || video.metadata.prompt}
                      </p>
                    )}
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2 z-20">
                    <span className="rounded-full bg-amber-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm flex items-center gap-1 font-mono uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Video
                    </span>
                  </div>

                  {/* Delete button */}
                  <div className="absolute bottom-2 right-2 z-20">
                    <button
                      type="button"
                      onClick={() => onDeleteVideo(video.id)}
                      className="rounded-full bg-red-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm hover:bg-red-500/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}

            {/* Completed Videos (only for videos tab) */}
            {activeTab === "videos" &&
              completedVideos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0b] group cursor-pointer"
                  onClick={() =>
                    setSelectedItem({
                      type: "video",
                      url: resolveApiUrl(video.video_url!),
                      prompt: video.metadata?.original_prompt || video.metadata?.prompt,
                      video: video,
                    })
                  }
                >
                  {video.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiUrl(video.thumbnail_url)}
                      alt="Video thumbnail"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={resolveApiUrl(video.video_url!)}
                      className="h-full w-full object-cover"
                      muted
                    />
                  )}

                  {/* Play Icon */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center group-hover:opacity-50 transition-opacity">
                      <svg
                        className="w-6 h-6 text-white ml-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto">
                    {(video.metadata?.original_prompt || video.metadata?.prompt) && (
                      <p className="text-[10px] text-gray-200 line-clamp-4 mb-1 font-mono">
                        {video.metadata.original_prompt || video.metadata.prompt}
                      </p>
                    )}
                    {!(video.metadata?.original_prompt || video.metadata?.prompt) && video.duration && (
                      <span className="text-[10px] text-gray-300 mb-1 font-mono">
                        {Math.round(video.duration)}s
                      </span>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryVideo(video.id);
                        }}
                        disabled={loading || retryingId === `video:${video.id}`}
                        className="flex-1 rounded-md bg-[#1a1a1a]/90 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white border border-[#333] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        {retryingId === `video:${video.id}` ? "Retrying..." : "Retry"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteVideo(video.id);
                        }}
                        disabled={loading}
                        className="flex-1 rounded-md bg-red-500/80 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 left-2">
                    <span className="rounded-full bg-blue-500/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm font-mono uppercase tracking-wide">
                      {video.type}
                    </span>
                  </div>

                  {/* Status Badge */}
                  {video.status !== "completed" && (
                    <div className="absolute top-2 right-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] backdrop-blur-sm ${
                          video.status === "processing"
                            ? "bg-amber-500/50 text-white"
                            : video.status === "failed"
                            ? "bg-red-500/50 text-white"
                            : "bg-gray-500/50 text-white"
                        } font-mono uppercase tracking-wide`}
                      >
                        {video.status}
                      </span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onClick={() => setSelectedItem(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedItem(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 z-10"
          >
            ×
          </button>

          {selectedItem.editMode && selectedItem.image ? (
            /* Edit Mode: Split Layout */
            <div
              className="flex h-full w-full max-w-7xl mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: Image Preview (60%) */}
              <div className="flex-[6] flex flex-col items-center justify-center p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedItem.url}
                  alt="Source"
                  className="max-h-[80vh] max-w-full object-contain rounded-lg"
                />
                {selectedItem.prompt && (
                  <div className="mt-4 max-w-xl w-full bg-white/5 rounded-lg p-3 backdrop-blur-sm">
                    <p className="text-xs text-gray-400 mb-1 font-mono uppercase tracking-wider">Original Prompt</p>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap line-clamp-3 font-mono">
                      {selectedItem.prompt}
                    </p>
                  </div>
                )}
              </div>

              {/* Right: Edit Panel (40%) */}
              <div className="flex-[4] h-full">
                <ImageEditPanel
                  sourceImage={selectedItem.image}
                  characterId={characterId ?? null}
                  onImageGenerated={() => {
                    onRefresh?.();
                  }}
                  onClose={() => setSelectedItem(null)}
                  onTaskStarted={onTaskStarted}
                />
              </div>
            </div>
          ) : (
            /* Normal Mode: Horizontal Layout */
            <div
              className="flex flex-row w-full h-full max-w-6xl mx-auto gap-6 p-6 pt-16"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left: Media Preview */}
              <div className="flex-1 flex flex-col items-center justify-center min-w-0 overflow-auto">
                {selectedItem.type === "image" ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedItem.url}
                      alt="Full size"
                      className="max-h-[70vh] max-w-full object-contain rounded-lg"
                    />
                    {/* Action Buttons in Preview Mode */}
                    {selectedItem.image && (
                      <div className="mt-4 flex flex-col items-center gap-2">
                        <div className="flex gap-2">
                          {characterId && selectedItem.image.type !== "base" && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await setImageAsBase(selectedItem.image!.id);
                                  setSelectedItem(null);
                                  onRefresh?.();
                                } catch (err) {
                                  console.error("Failed to set as base:", err);
                                }
                              }}
                              className="rounded-lg bg-[#1a1a1a] border border-[#333] px-6 py-2 text-xs font-mono font-bold uppercase tracking-wide text-gray-300 hover:text-white"
                            >
                              Set as Base
                            </button>
                          )}
                          {characterId && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedItem({
                                  ...selectedItem,
                                  editMode: true,
                                })
                              }
                              className="rounded-lg bg-white px-6 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200"
                            >
                              Edit with AI
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <video
                      src={selectedItem.url}
                      controls
                      autoPlay
                      className="max-h-[70vh] max-w-full rounded-lg"
                    />
                  </>
                )}
              </div>

              {/* Right: Metadata Panel */}
              <div className="w-80 flex-shrink-0 bg-[#1a1a1a] rounded-lg overflow-hidden flex flex-col max-h-[calc(100vh-6rem)]">
                <div className="p-4 border-b border-white/10 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-white font-mono">
                    Details
                  </h3>
                </div>
                <div className="p-4 overflow-y-auto flex-1 font-mono">
                  {selectedItem.type === "image" && selectedItem.image && (
                    <div className="space-y-4">
                      {/* Grid of basic info */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Resolution */}
                        {(selectedItem.image.metadata?.width && selectedItem.image.metadata?.height) && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Resolution</p>
                            <p className="text-sm text-gray-200">
                              {selectedItem.image.metadata.width} x {selectedItem.image.metadata.height}
                            </p>
                          </div>
                        )}
                        {/* Ratio */}
                        {selectedItem.image.metadata?.width && selectedItem.image.metadata?.height && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Ratio</p>
                            <p className="text-sm text-gray-200">
                              {getAspectRatio(selectedItem.image.metadata.width, selectedItem.image.metadata.height)}
                            </p>
                          </div>
                        )}
                        {/* Content Type */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Type</p>
                          <p className="text-sm text-gray-200 capitalize">{selectedItem.image.type}</p>
                        </div>
                        {/* Style */}
                        {selectedItem.image.metadata?.style && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Style</p>
                            <p className="text-sm text-gray-200">{selectedItem.image.metadata.style}</p>
                          </div>
                        )}
                        {/* Cloth */}
                        {selectedItem.image.metadata?.cloth && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Cloth</p>
                            <p className="text-sm text-gray-200">{selectedItem.image.metadata.cloth}</p>
                          </div>
                        )}
                        {/* Steps */}
                        {selectedItem.image.metadata?.steps && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Steps</p>
                            <p className="text-sm text-gray-200">{selectedItem.image.metadata.steps}</p>
                          </div>
                        )}
                        {/* Guidance Scale */}
                        {selectedItem.image.metadata?.guidance_scale && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Guidance</p>
                            <p className="text-sm text-gray-200">{selectedItem.image.metadata.guidance_scale}</p>
                          </div>
                        )}
                        {/* Seed */}
                        {selectedItem.image.metadata?.seed && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Seed</p>
                            <p className="text-sm text-gray-200">{selectedItem.image.metadata.seed}</p>
                          </div>
                        )}
                      </div>

                      {/* User Reference Image */}
                      {selectedItem.image.metadata?.user_reference_path && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Reference Image</p>
                          <div className="relative group/ref inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={resolveApiUrl(selectedItem.image.metadata.user_reference_path)}
                              alt="Reference"
                              className="w-20 h-20 object-cover rounded-md border border-white/20"
                            />
                          </div>
                        </div>
                      )}

                      {/* Reference Images by ID (legacy) */}
                      {selectedItem.image.metadata?.reference_image_ids && selectedItem.image.metadata.reference_image_ids.length > 0 && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Base Images</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedItem.image.metadata.reference_image_ids.map((refId) => {
                              const refImage = images.find(img => img.id === refId);
                              return refImage && refImage.image_url ? (
                                <div key={refId} className="relative group/ref">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={resolveApiUrl(refImage.image_url)}
                                    alt="Reference"
                                    className="w-16 h-16 object-cover rounded-md border border-white/20"
                                  />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-center text-gray-300 py-0.5 rounded-b-md opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                    {refImage.type}
                                  </span>
                                </div>
                              ) : (
                                <div key={refId} className="w-16 h-16 bg-white/10 rounded-md flex items-center justify-center">
                                  <span className="text-[8px] text-gray-500 text-center px-1 break-all">{refId.slice(0, 8)}...</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Prompt */}
                      {selectedItem.prompt && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prompt</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{selectedItem.prompt}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedItem.type === "video" && selectedItem.video && (
                    <div className="space-y-4">
                      {/* Grid of basic info */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Resolution */}
                        {(selectedItem.video.metadata?.resolution || (selectedItem.video.metadata?.width && selectedItem.video.metadata?.height)) && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Resolution</p>
                            <p className="text-sm text-gray-200">
                              {selectedItem.video.metadata.resolution || `${selectedItem.video.metadata.width} x ${selectedItem.video.metadata.height}`}
                            </p>
                          </div>
                        )}
                        {/* Ratio */}
                        {selectedItem.video.metadata?.width && selectedItem.video.metadata?.height && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Ratio</p>
                            <p className="text-sm text-gray-200">
                              {getAspectRatio(selectedItem.video.metadata.width, selectedItem.video.metadata.height)}
                            </p>
                          </div>
                        )}
                        {/* Content Type */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Type</p>
                          <p className="text-sm text-gray-200 capitalize">
                            {selectedItem.video.metadata?.content_type || selectedItem.video.type}
                          </p>
                        </div>
                        {/* Model */}
                        {selectedItem.video.metadata?.video_model && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Model</p>
                            <p className="text-sm text-gray-200">{selectedItem.video.metadata.video_model}</p>
                          </div>
                        )}
                        {/* Duration */}
                        {(selectedItem.video.metadata?.duration || selectedItem.video.duration) && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Duration</p>
                            <p className="text-sm text-gray-200">
                              {Math.round(selectedItem.video.metadata?.duration || selectedItem.video.duration || 0)}s
                            </p>
                          </div>
                        )}
                        {/* Style */}
                        {selectedItem.video.metadata?.style && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Style</p>
                            <p className="text-sm text-gray-200">{selectedItem.video.metadata.style}</p>
                          </div>
                        )}
                        {/* Cloth */}
                        {selectedItem.video.metadata?.cloth && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Cloth</p>
                            <p className="text-sm text-gray-200">{selectedItem.video.metadata.cloth}</p>
                          </div>
                        )}
                      </div>

                      {/* Source Image with thumbnail */}
                      {selectedItem.video.metadata?.source_image_id && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Reference Image</p>
                          {(() => {
                            const sourceImage = images.find(img => img.id === selectedItem.video?.metadata?.source_image_id);
                            return sourceImage && sourceImage.image_url ? (
                              <div className="relative group/ref inline-block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={resolveApiUrl(sourceImage.image_url)}
                                  alt="Source"
                                  className="w-20 h-20 object-cover rounded-md border border-white/20"
                                />
                                <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-center text-gray-300 py-0.5 rounded-b-md opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                  {sourceImage.type}
                                </span>
                              </div>
                            ) : (
                              <div className="w-20 h-20 bg-white/10 rounded-md flex items-center justify-center">
                                <span className="text-[8px] text-gray-500 text-center px-1 break-all">
                                  {selectedItem.video?.metadata?.source_image_id?.slice(0, 8)}...
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Prompt */}
                      {selectedItem.prompt && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prompt</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{selectedItem.prompt}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback for items without full metadata */}
                  {!selectedItem.image && !selectedItem.video && selectedItem.prompt && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prompt</p>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{selectedItem.prompt}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animate Modal */}
      {animatingImage && characterId && (
        <AnimateModal
          image={animatingImage}
          characterId={characterId}
          onClose={() => {
            setAnimatingImage(null);
            setVideoRefForAnimate(null);
            onClearVideoRef?.();
          }}
          onVideoCreated={() => {
            setVideoRefForAnimate(null);
            onClearVideoRef?.();
            onVideoCreated?.();
          }}
          onTaskStarted={onTaskStarted}
          initialReferenceVideo={videoRefForAnimate}
        />
      )}
    </section>
  );
}
