"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SamplePost } from "@/lib/types";
import { listSamples, resolveApiUrl, uploadSample, importSampleFromUrl, updateSample, deleteSample, getSamplesStats, type SampleStats } from "@/lib/api";
import SampleCard from "@/components/SampleCard";
import AppNavbar from "@/components/AppNavbar";
import ProtectedRoute from "@/components/ProtectedRoute";

type FilterType = "all" | "image" | "video";
const PAGE_SIZE = 50;

function SamplesContent() {
  const router = useRouter();
  const [samples, setSamples] = useState<SamplePost[]>([]);
  const [stats, setStats] = useState<SampleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Lightbox
  const [selectedSample, setSelectedSample] = useState<SamplePost | null>(null);

  // Upload section
  const [instagramUrl, setInstagramUrl] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Lightbox tag editing
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editingTagsValue, setEditingTagsValue] = useState("");
  const [savingTags, setSavingTags] = useState(false);

  // Load samples and stats
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [samplesData, statsData] = await Promise.all([
          listSamples({ limit: PAGE_SIZE, offset: 0 }),
          getSamplesStats(),
        ]);
        setSamples(samplesData);
        setStats(statsData);
        setHasMore(samplesData.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load samples");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Reload samples when tag or media type filter changes
  useEffect(() => {
    async function loadFiltered() {
      try {
        setLoading(true);
        const params: { limit: number; offset: number; tag?: string; media_type?: "image" | "video" } = {
          limit: PAGE_SIZE,
          offset: 0,
        };
        if (selectedTag) params.tag = selectedTag;
        if (filterType !== "all") params.media_type = filterType;

        const samplesData = await listSamples(params);
        setSamples(samplesData);
        setHasMore(samplesData.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load samples");
      } finally {
        setLoading(false);
      }
    }
    loadFiltered();
  }, [selectedTag, filterType]);

  // Load more samples
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params: { limit: number; offset: number; tag?: string; media_type?: "image" | "video" } = {
        limit: PAGE_SIZE,
        offset: samples.length,
      };
      if (selectedTag) params.tag = selectedTag;
      if (filterType !== "all") params.media_type = filterType;

      const moreSamples = await listSamples(params);
      setSamples((prev) => [...prev, ...moreSamples]);
      setHasMore(moreSamples.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more samples");
    } finally {
      setLoadingMore(false);
    }
  };

  // Get tag counts from stats (total from DB)
  const tagCounts = useMemo(() => {
    if (!stats) return new Map<string, number>();
    return new Map(Object.entries(stats.tag_counts));
  }, [stats]);

  const allTags = useMemo(() => {
    return Array.from(tagCounts.keys()).sort();
  }, [tagCounts]);

  // Filtered samples (only search query is client-side, tag/type are server-side)
  const filteredSamples = useMemo(() => {
    if (!searchQuery) return samples;
    return samples.filter((sample) => {
      const query = searchQuery.toLowerCase();
      const matchesCreator = sample.creator_name.toLowerCase().includes(query);
      const matchesTags = sample.tags.some((t) => t.toLowerCase().includes(query));
      const matchesCaption = sample.caption?.toLowerCase().includes(query);
      return matchesCreator || matchesTags || matchesCaption;
    });
  }, [samples, searchQuery]);

  // Handle Apply - navigate to main page
  const handleApply = (sample: SamplePost) => {
    if (sample.media_type === "video") {
      // Video: navigate to main page with videoRef param
      router.push(`/?videoRef=${encodeURIComponent(sample.media_url)}`);
    } else {
      // Image: navigate with ref param
      router.push(`/?ref=${encodeURIComponent(sample.media_url)}`);
    }
  };

  // Reload samples and stats
  const reloadSamples = async () => {
    try {
      const [data, statsData] = await Promise.all([
        listSamples({ limit: PAGE_SIZE, offset: 0 }),
        getSamplesStats(),
      ]);
      setSamples(data);
      setStats(statsData);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload samples");
    }
  };

  // Tag editing functions
  const handleStartEditTags = () => {
    if (selectedSample) {
      setEditingTagsValue(selectedSample.tags.join(", "));
      setIsEditingTags(true);
    }
  };

  const handleCancelEditTags = () => {
    setIsEditingTags(false);
    setEditingTagsValue("");
  };

  const handleSaveTags = async () => {
    if (!selectedSample) return;

    setSavingTags(true);
    try {
      const tagsArray = editingTagsValue
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const uniqueTags = Array.from(new Set(tagsArray));

      const updated = await updateSample(selectedSample.id, { tags: uniqueTags });

      // Update local state
      setSamples((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setSelectedSample(updated);
      setIsEditingTags(false);
      setEditingTagsValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tags");
    } finally {
      setSavingTags(false);
    }
  };

  // Quick tag add for upload
  const handleQuickTagAdd = (tag: string) => {
    const currentTags = uploadTags.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (!currentTags.includes(tag)) {
      setUploadTags(currentTags.length > 0 ? `${uploadTags}, ${tag}` : tag);
    }
  };

  // Reset tag editing when closing lightbox
  const handleCloseLightbox = () => {
    setSelectedSample(null);
    setIsEditingTags(false);
    setEditingTagsValue("");
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setUploadError("Please select an image or video file");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      await uploadSample(file, "uploaded", uploadTags);
      await reloadSamples();
      setUploadTags("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Handle Instagram URL import
  const handleImportUrl = async () => {
    if (!instagramUrl.trim()) return;

    setUploading(true);
    setUploadError(null);

    try {
      await importSampleFromUrl(instagramUrl.trim(), uploadTags);
      await reloadSamples();
      setInstagramUrl("");
      setUploadTags("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <AppNavbar loading={uploading} statusText={`${filteredSamples.length} samples`} />

      {/* Error Banner */}
      {(error || uploadError) && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-red-500/20 border-b border-red-500/30 px-4 py-2">
          <p className="text-sm text-red-300 text-center font-mono">{error || uploadError}</p>
          <button
            type="button"
            onClick={() => { setError(null); setUploadError(null); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-red-300 text-lg hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="fixed inset-0 pt-20 p-4 overflow-hidden">
        <div className="h-full grid grid-cols-[280px_1fr] gap-4 min-h-0">

          {/* Left: Upload & Filters Panel */}
          <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
            {/* Upload Section */}
            <div className="mb-4">
              <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
                Add Sample
              </p>
              <h2 className="text-lg font-semibold font-mono mb-3">Upload</h2>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />

              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors mb-3 ${
                  dragOver
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-[#333] hover:border-white/30"
                }`}
              >
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-xs text-gray-400 font-mono">Drop file or click</p>
              </div>

              {/* Instagram URL Input */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Instagram URL..."
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
                />
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
                />
                {/* Quick tag suggestions */}
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allTags.slice(0, 5).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleQuickTagAdd(tag)}
                        disabled={uploading}
                        className="px-2 py-0.5 rounded-full border border-[#333] text-xs text-gray-400 font-mono hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleImportUrl}
                  disabled={uploading || !instagramUrl.trim()}
                  className="w-full rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:bg-white/50 disabled:cursor-not-allowed disabled:hover:bg-white/50"
                >
                  {uploading ? "Importing..." : "Import"}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#333] my-4" />

            {/* Filters */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
                Filters
              </p>
              <h2 className="text-lg font-semibold font-mono mb-3">Browse</h2>

              {/* Search */}
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none mb-3 font-mono"
              />

            </div>
          </section>

          {/* Right: Gallery */}
          <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
                    Gallery
                  </p>
                  <h2 className="text-lg font-semibold font-mono">Reference Content</h2>
                </div>
                {/* Content Type Filter */}
                <div className="flex gap-1">
                  {(["all", "image", "video"] as FilterType[]).map((type) => {
                    const isActive = filterType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFilterType(type)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                          isActive
                            ? "bg-white text-black border-transparent"
                            : "bg-transparent text-gray-400 border-[#333] hover:text-white hover:border-white/30"
                        }`}
                      >
                        {type === "all" ? "All" : type === "image" ? "Image" : "Video"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tag Tabs */}
              {allTags.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-600">
                  <button
                    type="button"
                    onClick={() => setSelectedTag(null)}
                    className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm font-mono font-medium transition-colors ${
                      selectedTag === null
                        ? "bg-white text-black border-transparent"
                        : "bg-transparent text-gray-300 border-[#333] hover:text-white hover:border-white/30"
                    }`}
                  >
                    All
                    <span className={`ml-2 text-xs ${selectedTag === null ? "text-gray-600" : "text-gray-500"}`}>
                      {stats?.total ?? samples.length}
                    </span>
                  </button>
                  {allTags.map((tag) => {
                    const isActive = selectedTag === tag;
                    const count = tagCounts.get(tag) || 0;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(isActive ? null : tag)}
                        className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm font-mono font-medium transition-colors ${
                          isActive
                            ? "bg-white text-black border-transparent"
                            : "bg-transparent text-gray-300 border-[#333] hover:text-white hover:border-white/30"
                        }`}
                      >
                        {tag}
                        <span className={`ml-2 text-xs ${isActive ? "text-gray-600" : "text-gray-500"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Gallery Grid */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                </div>
              ) : filteredSamples.length === 0 ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-sm mb-2 font-mono">No samples found</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {searchQuery || selectedTag || filterType !== "all"
                        ? "Try adjusting filters"
                        : "Upload or import samples to get started"}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredSamples.map((sample) => (
                      <SampleCard
                        key={sample.id}
                        sample={sample}
                        onSelect={setSelectedSample}
                        onApply={handleApply}
                      />
                    ))}
                  </div>
                  {/* Load More Button */}
                  {hasMore && !searchQuery && (
                    <div className="flex justify-center mt-6 pb-4">
                      <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="rounded-lg border border-[#333] px-6 py-2 text-sm font-mono text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingMore ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                            Loading...
                          </span>
                        ) : (
                          `Load More (${samples.length} loaded)`
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Lightbox */}
      {selectedSample && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={handleCloseLightbox}
        >
          <button
            type="button"
            onClick={handleCloseLightbox}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 z-10"
          >
            ×
          </button>

          <div
            className="flex flex-col lg:flex-row max-h-[90vh] max-w-[90vw] gap-6 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media */}
            <div className="flex-shrink-0 flex items-center justify-center">
              {selectedSample.media_type === "video" ? (
                <video
                  src={resolveApiUrl(selectedSample.media_url)}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-xl"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveApiUrl(selectedSample.media_url)}
                  alt={selectedSample.creator_name}
                  className="max-h-[70vh] max-w-full object-contain rounded-xl"
                />
              )}
            </div>

            {/* Info Panel */}
            <div className="w-full lg:w-72 flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4">
              {/* Creator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm text-white font-bold">
                  {selectedSample.creator_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-mono font-medium text-white">@{selectedSample.creator_name}</p>
                  {selectedSample.source_url !== "uploaded" && (
                    <a
                      href={selectedSample.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-white font-mono"
                    >
                      View original
                    </a>
                  )}
                </div>
              </div>

              {/* Caption */}
              {selectedSample.caption && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1 font-mono uppercase tracking-wider">Caption</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-4 font-mono">
                    {selectedSample.caption}
                  </p>
                </div>
              )}

              {/* Tags */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Tags</p>
                  {!isEditingTags && (
                    <button
                      type="button"
                      onClick={handleStartEditTags}
                      className="text-xs text-gray-400 hover:text-white font-mono"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingTags ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editingTagsValue}
                      onChange={(e) => setEditingTagsValue(e.target.value)}
                      placeholder="Tags (comma-separated)"
                      disabled={savingTags}
                      className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
                      autoFocus
                    />
                    {/* Quick tag suggestions in edit mode */}
                    {allTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allTags.slice(0, 5).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const currentTags = editingTagsValue.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
                              if (!currentTags.includes(tag)) {
                                setEditingTagsValue(currentTags.length > 0 ? `${editingTagsValue}, ${tag}` : tag);
                              }
                            }}
                            disabled={savingTags}
                            className="px-2 py-0.5 rounded-full border border-[#333] text-xs text-gray-400 font-mono hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTags}
                        disabled={savingTags}
                        className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingTags ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditTags}
                        disabled={savingTags}
                        className="flex-1 rounded-lg border border-[#333] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : selectedSample.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSample.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded-full border border-[#333] text-xs text-gray-400 font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 font-mono italic">No tags</p>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleApply(selectedSample)}
                  className="w-full rounded-lg bg-white px-4 py-3 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200"
                >
                  Apply as Reference
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Delete this sample?")) return;
                    try {
                      await deleteSample(selectedSample.id);
                      setSamples((prev) => prev.filter((s) => s.id !== selectedSample.id));
                      setSelectedSample(null);
                    } catch (err) {
                      console.error("Failed to delete sample:", err);
                    }
                  }}
                  className="w-full rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wide text-red-400 hover:bg-red-500/40"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

export default function SamplesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <span className="text-amber-400 animate-pulse font-mono">Loading...</span>
        </div>
      }>
        <SamplesContent />
      </Suspense>
    </ProtectedRoute>
  );
}
