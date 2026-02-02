"use client";

import { useState, useEffect } from "react";
import type { Image } from "@/lib/types";
import {
  resolveApiUrl,
  generateTwitterCaption,
  postToTwitter,
} from "@/lib/api";

interface TwitterModalProps {
  image: Image;
  onClose: () => void;
}

type ModalState = "loading" | "ready" | "posting" | "success" | "error";

export default function TwitterModal({ image, onClose }: TwitterModalProps) {
  const [state, setState] = useState<ModalState>("loading");
  const [caption, setCaption] = useState("");
  const [characterLimit] = useState(280);
  const [error, setError] = useState<string | null>(null);
  const [tweetUrl, setTweetUrl] = useState<string | null>(null);

  const charactersRemaining = characterLimit - caption.length;
  const isOverLimit = charactersRemaining < 0;

  useEffect(() => {
    const loadCaption = async () => {
      try {
        const result = await generateTwitterCaption(image.id);
        setCaption(result.suggested_caption);
        setState("ready");
      } catch (err) {
        setCaption(image.metadata?.prompt?.slice(0, 250) || "Check out this AI-generated image!");
        setState("ready");
      }
    };

    loadCaption();
  }, [image.id, image.metadata?.prompt]);

  const handlePost = async () => {
    if (isOverLimit) {
      setError("Caption exceeds 280 characters");
      return;
    }

    if (!caption.trim()) {
      setError("Please enter a caption");
      return;
    }

    setState("posting");
    setError(null);

    try {
      const result = await postToTwitter({
        image_id: image.id,
        caption: caption.trim(),
      });

      if (result.success && result.tweet_url) {
        setTweetUrl(result.tweet_url);
        setState("success");
      } else {
        setError(result.error || "Failed to post to Twitter");
        setState("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post to Twitter");
      setState("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] rounded-2xl border border-[#333] max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <h2 className="text-lg font-semibold font-mono">Post to X</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {state === "success" ? (
            /* Success State */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold font-mono text-white mb-2">Posted Successfully!</h3>
              <p className="text-gray-400 mb-6 font-mono">Your image has been shared on X.</p>
              {tweetUrl && (
                <a
                  href={tweetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-gray-200 text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  View on X
                </a>
              )}
            </div>
          ) : (
            /* Normal State */
            <div className="flex gap-4">
              {/* Left: Image Preview */}
              <div className="w-1/3 flex-shrink-0">
                <div className="aspect-[9/16] rounded-xl overflow-hidden border border-white/10 bg-[#0b0b0b]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.image_url ? resolveApiUrl(image.image_url) : ""}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* Right: Caption Editor */}
              <div className="flex-1 flex flex-col">
                {state === "loading" ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm font-mono">Loading...</p>
                  </div>
                ) : (
                  <>
                    {/* Caption Input */}
                    <div className="mb-4 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">Caption</p>
                        <p className={`text-xs font-mono ${isOverLimit ? "text-red-400" : charactersRemaining < 20 ? "text-yellow-400" : "text-gray-400"}`}>
                          {charactersRemaining}
                        </p>
                      </div>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Write your caption..."
                        rows={6}
                        disabled={state === "posting"}
                        className="w-full bg-[#0b0b0b] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 resize-none font-mono disabled:opacity-50"
                      />
                    </div>

                    {/* Character Count Bar */}
                    <div className="mb-4">
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${isOverLimit ? "bg-red-500" : charactersRemaining < 20 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min((caption.length / characterLimit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                        <p className="text-sm text-red-300 font-mono">{error}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={onClose}
                        disabled={state === "posting"}
                        className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wide transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handlePost}
                        disabled={state === "posting" || isOverLimit || !caption.trim()}
                        className="flex-1 py-3 rounded-xl bg-white hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed text-black text-xs font-mono font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
                      >
                        {state === "posting" ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Posting...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                            Post to X
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
