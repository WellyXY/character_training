"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SamplePost } from "@/lib/types";
import {
  listSamples,
  resolveApiUrl,
  uploadSample,
  importSampleFromUrl,
  updateSample,
  deleteSample,
  getSamplesStats,
  type SampleStats,
} from "@/lib/api";
import SampleCard from "@/components/SampleCard";
import ReferenceModal from "@/components/ReferenceModal";
import NavTabs from "@/components/NavTabs";
import { useAuth } from "@/contexts/AuthContext";
import { useCharacter } from "@/contexts/CharacterContext";

type FilterType = "all" | "image" | "video";
const PAGE_SIZE = 50;

export default function CommunityPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedCharacterId, selectedCharacter } = useCharacter();
  const isAdmin = user?.is_admin ?? false;

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

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Reference modal
  const [refModalSample, setRefModalSample] = useState<SamplePost | null>(null);

  // Lightbox tag editing
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editingTagsValue, setEditingTagsValue] = useState("");
  const [savingTags, setSavingTags] = useState(false);

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

  const tagCounts = useMemo(() => {
    if (!stats) return new Map<string, number>();
    return new Map(Object.entries(stats.tag_counts));
  }, [stats]);

  const allTags = useMemo(() => Array.from(tagCounts.keys()).sort(), [tagCounts]);

  const filteredSamples = useMemo(() => {
    if (!searchQuery) return samples;
    return samples.filter((sample) => {
      const query = searchQuery.toLowerCase();
      return (
        sample.creator_name.toLowerCase().includes(query) ||
        sample.tags.some((t) => t.toLowerCase().includes(query)) ||
        sample.caption?.toLowerCase().includes(query)
      );
    });
  }, [samples, searchQuery]);

  const handleApply = (sample: SamplePost) => {
    if (sample.media_type === "video") {
      router.push(`/?videoRef=${encodeURIComponent(sample.media_url)}`);
      return;
    }
    if (!selectedCharacterId) {
      setError("Please select a character first before applying a reference.");
      return;
    }
    setRefModalSample(sample);
  };

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

  const handleStartEditTags = () => {
    if (selectedSample) {
      setEditingTagsValue(selectedSample.tags.join(", "));
      setIsEditingTags(true);
    }
  };

  const handleSaveTags = async () => {
    if (!selectedSample) return;
    setSavingTags(true);
    try {
      const tagsArray = editingTagsValue.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
      const updated = await updateSample(selectedSample.id, { tags: Array.from(new Set(tagsArray)) });
      setSamples((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSelectedSample(updated);
      setIsEditingTags(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tags");
    } finally {
      setSavingTags(false);
    }
  };

  const handleQuickTagAdd = (tag: string) => {
    const currentTags = uploadTags.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (!currentTags.includes(tag)) {
      setUploadTags(currentTags.length > 0 ? `${uploadTags}, ${tag}` : tag);
    }
  };

  const handleCloseLightbox = () => {
    setSelectedSample(null);
    setIsEditingTags(false);
    setEditingTagsValue("");
  };

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
      setShowUploadModal(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleImportUrl = async () => {
    if (!instagramUrl.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await importSampleFromUrl(instagramUrl.trim(), uploadTags);
      await reloadSamples();
      setInstagramUrl("");
      setUploadTags("");
      setShowUploadModal(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      {/* Error Banner */}
      {error && (
        <div className="flex-shrink-0 mb-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-between">
          <p className="text-sm text-red-300 font-mono">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">×</button>
        </div>
      )}

      {/* Gallery Section */}
      <section className="flex-1 flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 mb-3">
          <div className="flex items-center justify-between gap-4 mb-3">
            <NavTabs />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-mono font-bold uppercase tracking-wide hover:bg-purple-500 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload
              </button>
            )}
          </div>

          {/* Filter Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none font-mono"
            />
            <div className="flex gap-1">
              {(["all", "image", "video"] as FilterType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                    filterType === type
                      ? "bg-white text-black border-transparent"
                      : "bg-transparent text-gray-400 border-[#333] hover:text-white hover:border-white/30"
                  }`}
                >
                  {type === "all" ? "All" : type === "image" ? "Image" : "Video"}
                </button>
              ))}
            </div>
          </div>

          {/* Tag Tabs */}
          {allTags.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-600">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                  selectedTag === null
                    ? "bg-white text-black border-transparent"
                    : "bg-transparent text-gray-300 border-[#333] hover:text-white hover:border-white/30"
                }`}
              >
                All <span className="ml-1 opacity-60">{stats?.total ?? samples.length}</span>
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                    selectedTag === tag
                      ? "bg-white text-black border-transparent"
                      : "bg-transparent text-gray-300 border-[#333] hover:text-white hover:border-white/30"
                  }`}
                >
                  {tag} <span className="ml-1 opacity-60">{tagCounts.get(tag) ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
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
                  <SampleCard key={sample.id} sample={sample} onSelect={setSelectedSample} onApply={handleApply} />
                ))}
              </div>
              {hasMore && !searchQuery && (
                <div className="flex justify-center mt-6 pb-4">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-[#333] px-6 py-2 text-sm font-mono text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
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

      {/* Lightbox */}
      {selectedSample && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={handleCloseLightbox}>
          <button type="button" onClick={handleCloseLightbox} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 z-10">×</button>
          <div className="flex flex-col lg:flex-row max-h-[90vh] max-w-[90vw] gap-6 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 flex items-center justify-center">
              {selectedSample.media_type === "video" ? (
                <video src={resolveApiUrl(selectedSample.media_url)} controls autoPlay className="max-h-[70vh] max-w-full rounded-xl" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resolveApiUrl(selectedSample.media_url)} alt={selectedSample.creator_name} className="max-h-[70vh] max-w-full object-contain rounded-xl" />
              )}
            </div>
            <div className="w-full lg:w-72 flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm text-white font-bold">
                  {selectedSample.creator_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-mono font-medium text-white">@{selectedSample.creator_name}</p>
                  {selectedSample.source_url !== "uploaded" && (
                    <a href={selectedSample.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-white font-mono">View original</a>
                  )}
                </div>
              </div>
              {selectedSample.caption && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1 font-mono uppercase tracking-wider">Caption</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-4 font-mono">{selectedSample.caption}</p>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Tags</p>
                  {!isEditingTags && (
                    <button type="button" onClick={handleStartEditTags} className="text-xs text-gray-400 hover:text-white font-mono">Edit</button>
                  )}
                </div>
                {isEditingTags ? (
                  <div className="space-y-2">
                    <input
                      type="text" value={editingTagsValue}
                      onChange={(e) => setEditingTagsValue(e.target.value)}
                      placeholder="Tags (comma-separated)" disabled={savingTags}
                      className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleSaveTags} disabled={savingTags} className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50">
                        {savingTags ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={() => { setIsEditingTags(false); setEditingTagsValue(""); }} disabled={savingTags} className="flex-1 rounded-lg border border-[#333] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : selectedSample.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSample.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 rounded-full border border-[#333] text-xs text-gray-400 font-mono">{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 font-mono italic">No tags</p>
                )}
              </div>
              <div className="flex-1" />
              <div className="space-y-2">
                <button type="button" onClick={() => handleApply(selectedSample)} className="w-full rounded-lg bg-white px-4 py-3 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200">
                  Apply Ref
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Delete this sample?")) return;
                    try {
                      await deleteSample(selectedSample.id);
                      setSamples((prev) => prev.filter((s) => s.id !== selectedSample.id));
                      setSelectedSample(null);
                    } catch (err) { console.error("Failed to delete sample:", err); }
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

      {/* Upload Modal (admin only) */}
      {/* Reference Modal */}
      {refModalSample && selectedCharacterId && (
        <ReferenceModal
          sample={refModalSample}
          characterId={selectedCharacterId}
          characterName={selectedCharacter?.name ?? null}
          onClose={() => setRefModalSample(null)}
          onGenerated={(mode, customMsg) => {
            const params = new URLSearchParams();
            params.set("ref", refModalSample!.media_url);
            params.set("refMode", mode);
            if (customMsg) params.set("refMsg", customMsg);
            setRefModalSample(null);
            setSelectedSample(null);
            router.push(`/?${params.toString()}`);
          }}
        />
      )}

      {showUploadModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[#333] bg-[#111] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">Admin</p>
                <h2 className="text-lg font-semibold font-mono">Add Sample</h2>
              </div>
              <button type="button" onClick={() => setShowUploadModal(false)} className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center text-sm">×</button>
            </div>
            {uploadError && <p className="mb-3 text-xs text-red-400 font-mono">{uploadError}</p>}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={(e) => handleFileUpload(e.target.files)} className="hidden" />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${dragOver ? "border-purple-500 bg-purple-500/10" : "border-[#333] hover:border-white/30"}`}
            >
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-xs text-gray-400 font-mono">{uploading ? "Uploading..." : "Drop file or click to browse"}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Or import from URL</p>
              <input type="text" placeholder="Instagram URL..." value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} disabled={uploading} className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono" />
              <input type="text" placeholder="Tags (comma-separated)" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} disabled={uploading} className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono" />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.slice(0, 6).map((tag) => (
                    <button key={tag} type="button" onClick={() => handleQuickTagAdd(tag)} disabled={uploading} className="px-2 py-0.5 rounded-full border border-[#333] text-xs text-gray-400 font-mono hover:text-white hover:border-white/30 disabled:opacity-50">+ {tag}</button>
                  ))}
                </div>
              )}
              <button type="button" onClick={handleImportUrl} disabled={uploading || !instagramUrl.trim()} className="w-full rounded-lg bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:bg-white/50 disabled:cursor-not-allowed">
                {uploading ? "Importing..." : "Import from URL"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
