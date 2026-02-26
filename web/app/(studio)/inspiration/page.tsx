"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadSample } from "@/lib/api";
import NavTabs from "@/components/NavTabs";

export default function InspirationPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    setSelectedFile(file);
    setError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleClear = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDescription("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerateSimilar = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const sample = await uploadSample(selectedFile, "inspiration", description || undefined);
      router.push(`/?ref=${encodeURIComponent(sample.media_url)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  return (
    <div className="h-full grid grid-cols-[1fr_300px] gap-4 min-h-0">

      {/* Left: Upload Panel */}
      <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-4 h-full overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <NavTabs />
          <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb]">Reference Image</p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-between">
            <p className="text-xs text-red-400 font-mono">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white ml-2">×</button>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />

        {previewUrl ? (
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-[#333]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Reference preview" className="w-full h-full object-contain" />
              <button type="button" onClick={handleClear} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white text-sm hover:bg-black flex items-center justify-center">×</button>
            </div>
            <div className="flex-shrink-0 space-y-3">
              <input
                type="text" placeholder="Optional description or tags..."
                value={description} onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 rounded-lg border border-[#333] bg-[#0b0b0b] text-sm text-white placeholder-gray-500 focus:border-white/30 focus:outline-none disabled:opacity-50 font-mono"
              />
              <button
                type="button" onClick={handleGenerateSimilar} disabled={uploading}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                    Uploading...
                  </span>
                ) : "Generate Similar"}
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragOver ? "border-green-500 bg-green-500/10" : "border-[#333] hover:border-white/30 hover:bg-white/5"
            }`}
          >
            <svg className="w-12 h-12 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-300 font-mono font-medium mb-1">Drop an image here</p>
            <p className="text-xs text-gray-500 font-mono">or click to browse</p>
          </div>
        )}
      </section>

      {/* Right: Info Panel */}
      <section className="flex flex-col rounded-2xl border border-[#333] bg-[#111] p-6 h-full overflow-y-auto">
        <p className="text-xs font-mono uppercase tracking-widest text-[#cbcbcb] mb-1">How it works</p>
        <h2 className="text-lg font-semibold font-mono mb-6">Inspiration Mode</h2>

        <div className="space-y-6 text-sm font-mono text-gray-400">
          {[
            { step: "1", title: "Upload a reference image", desc: "Drop or select any image that captures the style, pose, or composition you want to recreate." },
            { step: "2", title: "Add an optional description", desc: "Describe what you like about the image or add tags to guide the AI generation." },
            { step: "3", title: "Generate Similar", desc: "Click the button to upload your image and jump straight to the studio with it pre-loaded as a reference." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/20 border border-green-600/40 text-green-400 text-xs flex items-center justify-center font-bold">{step}</span>
              <div>
                <p className="text-white font-medium mb-1">{title}</p>
                <p>{desc}</p>
              </div>
            </div>
          ))}

          <div className="border-t border-[#333] pt-6">
            <p className="text-xs uppercase tracking-widest text-[#cbcbcb] mb-3">Tips</p>
            <ul className="space-y-2 text-xs text-gray-500">
              <li>• Works best with clear, well-lit photos</li>
              <li>• The studio will use the image as a visual reference alongside your text prompts</li>
              <li>• Uploaded images are saved to your Community gallery</li>
              <li>• You can also pick existing images from the Community tab</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
