"use client";

import { useEffect, useRef } from "react";
import type { GenerationTask } from "@/lib/types";
import { resolveApiUrl } from "@/lib/api";

interface GenerationProgressCardProps {
  task: GenerationTask;
  onComplete: (resultUrl: string) => void;
  onError: (error: string) => void;
}

const STAGE_DISPLAY: Record<string, string> = {
  preparing: "Preparing...",
  generating: "Generating...",
  "generating image": "Generating image...",
  "generating video": "Generating video...",
  completed: "Completed!",
  failed: "Failed",
};

export default function GenerationProgressCard({
  task,
  onComplete,
  onError,
}: GenerationProgressCardProps) {
  const completionHandledRef = useRef(false);
  const failureHandledRef = useRef(false);

  // Reset flags when a new task is rendered
  useEffect(() => {
    completionHandledRef.current = false;
    failureHandledRef.current = false;
  }, [task.task_id]);

  // Handle completion/error callbacks
  useEffect(() => {
    if (task.status === "completed" && task.result_url) {
      if (!completionHandledRef.current) {
        completionHandledRef.current = true;
        onComplete(task.result_url);
      }
    } else if (task.status === "failed" && task.error) {
      if (!failureHandledRef.current) {
        failureHandledRef.current = true;
        onError(task.error);
      }
    }
  }, [task.status, task.result_url, task.error, onComplete, onError]);

  const isActive = task.status === "pending" || task.status === "generating";
  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";

  // Determine card style based on status
  const cardStyle = isCompleted
    ? "border-green-500/30 bg-green-500/10"
    : isFailed
    ? "border-red-500/30 bg-red-500/10"
    : "border-blue-500/30 bg-blue-500/10";

  const statusColor = isCompleted
    ? "text-green-400"
    : isFailed
    ? "text-red-400"
    : "text-blue-400";

  const progressBarColor = isCompleted
    ? "bg-green-500"
    : isFailed
    ? "bg-red-500"
    : "bg-blue-500";

  return (
    <div className={`rounded-xl border ${cardStyle} p-4 transition-all duration-300 font-mono`}>
      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-3">
        {isActive && (
          <span className="animate-pulse text-blue-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
          </span>
        )}
        {isCompleted && <span className="text-green-400">&#10003;</span>}
        {isFailed && <span className="text-red-400">&#10007;</span>}
        <span className={`text-xs uppercase tracking-widest ${statusColor}`}>
          {isActive
            ? `Generating ${task.progress}%`
            : isCompleted
            ? "Completed"
            : "Failed"}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${progressBarColor} transition-all duration-300`}
          style={{ width: `${task.progress}%` }}
        />
      </div>

      {/* Stage */}
      <p className="text-xs text-gray-400 mb-2">
        {STAGE_DISPLAY[task.stage] || task.stage}
      </p>

      {/* Error message if failed */}
      {isFailed && task.error && (
        <p className="text-xs text-red-300 mb-2">Error: {task.error}</p>
      )}

      {/* Prompt Preview */}
      <p className="text-sm text-gray-300 line-clamp-2 mb-2">{task.prompt}</p>

      {/* Reference Image */}
      {task.reference_image_url && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <span className="text-xs text-gray-400">Reference:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveApiUrl(task.reference_image_url)}
            alt="Reference"
            className="w-12 h-12 object-cover rounded"
          />
        </div>
      )}

      {/* Result Image if completed */}
      {isCompleted && task.result_url && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/10 mt-2">
          <span className="text-xs text-green-400">Generated:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveApiUrl(task.result_url)}
            alt="Generated"
            className="w-16 h-16 object-cover rounded"
          />
        </div>
      )}
    </div>
  );
}
