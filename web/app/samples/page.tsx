"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import type { SamplePost } from "@/lib/types";
import { listSamples, resolveApiUrl, uploadSample, importSampleFromUrl } from "@/lib/api";
import SampleCard from "@/components/SampleCard";
import AppNavbar from "@/components/AppNavbar";

type FilterType = "all" | "image" | "video";

function SamplesContent() {
  const router = useRouter();
  const [samples, setSamples] = useState<SamplePost[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Load samples
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await listSamples();
        setSamples(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load samples");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Extract unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    samples.forEach((s) => s.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [samples]);

  // Filtered samples
  const filteredSamples = useMemo(() => {
    return samples.filter((sample) => {
      if (filterType !== "all" && sample.media_type !== filterType) {
        return false;
      }
      if (selectedTag && !sample.tags.includes(selectedTag)) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesCreator = sample.creator_name.toLowerCase().includes(query);
        const matchesTags = sample.tags.some((t) => t.toLowerCase().includes(query));
        const matchesCaption = sample.caption?.toLowerCase().includes(query);
        if (!matchesCreator && !matchesTags && !matchesCaption) {
          return false;
        }
      }
      return true;
    });
  }, [samples, filterType, selectedTag, searchQuery]);

  // Handle Apply
  const handleApply = (sample: SamplePost) => {
    router.push(`/?ref=${encodeURIComponent(sample.media_url)}`);
  };

  // Reload samples
  const reloadSamples = async () => {
    try {
      const data = await listSamples();
      setSamples(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload samples");
    }
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
          <p className="text-sm text-red-300 text-center">{error || uploadError}</p>
          <button
            type="button"
            onClick={() => { setError(null); setUploadError(null); }}
            style={{
              position: "absolute",
              right: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#fca5a5",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
            }}
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
              <h2 className="text-lg font-semibold mb-3">Upload</h2>

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
                <p className="text-xs text-gray-400">Drop file or click</p>
              </div>

              {/* Instagram URL Input */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Instagram URL..."
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50"
                />
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleImportUrl}
                  disabled={uploading || !instagramUrl.trim()}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: uploading || !instagramUrl.trim() ? "rgba(255,255,255,0.5)" : "#fff",
                    color: "#000",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: "none",
                    cursor: uploading || !instagramUrl.trim() ? "not-allowed" : "pointer",
                  }}
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
              <h2 className="text-lg font-semibold mb-3">Browse</h2>

              {/* Search */}
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none mb-3"
              />

              {/* Type Filter */}
              <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>Type</p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {(["all", "image", "video"] as FilterType[]).map((type) => {
                  const isActive = filterType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFilterType(type)}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 500,
                        backgroundColor: isActive ? "#fff" : "transparent",
                        color: isActive ? "#000" : "#d1d5db",
                        border: isActive ? "none" : "1px solid #333",
                        cursor: "pointer",
                      }}
                    >
                      {type === "all" ? "All" : type === "image" ? "Image" : "Video"}
                    </button>
                  );
                })}
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <>
                  <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>Tags</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTag(null)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "9999px",
                        fontSize: "12px",
                        backgroundColor: selectedTag === null ? "#fff" : "transparent",
                        color: selectedTag === null ? "#000" : "#9ca3af",
                        border: selectedTag === null ? "none" : "1px solid #333",
                        cursor: "pointer",
                      }}
                    >
                      All
                    </button>
                    {allTags.map((tag) => {
                      const isActive = selectedTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSelectedTag(isActive ? null : tag)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            backgroundColor: isActive ? "#fff" : "transparent",
                            color: isActive ? "#000" : "#9ca3af",
                            border: isActive ? "none" : "1px solid #333",
                            cursor: "pointer",
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Right: Gallery */}
          <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
            <div className="mb-4">
              <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">
                Gallery
              </p>
              <h2 className="text-lg font-semibold">Reference Content</h2>
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
                    <p className="text-sm mb-2">No samples found</p>
                    <p className="text-xs text-gray-500">
                      {searchQuery || selectedTag || filterType !== "all"
                        ? "Try adjusting filters"
                        : "Upload or import samples to get started"}
                    </p>
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Lightbox */}
      {selectedSample && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedSample(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedSample(null)}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "9999px",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: "20px",
              border: "none",
              cursor: "pointer",
              zIndex: 10,
            }}
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
                  <p className="font-medium text-white">@{selectedSample.creator_name}</p>
                  {selectedSample.source_url !== "uploaded" && (
                    <a
                      href={selectedSample.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      View original
                    </a>
                  )}
                </div>
              </div>

              {/* Caption */}
              {selectedSample.caption && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">Caption</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-4">
                    {selectedSample.caption}
                  </p>
                </div>
              )}

              {/* Tags */}
              {selectedSample.tags.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSample.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded-full border border-[#333] text-xs text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Apply Button */}
              <button
                type="button"
                onClick={() => handleApply(selectedSample)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  backgroundColor: "#fff",
                  color: "#000",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Apply as Reference
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function SamplesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <span className="text-amber-400 animate-pulse">Loading...</span>
      </div>
    }>
      <SamplesContent />
    </Suspense>
  );
}
