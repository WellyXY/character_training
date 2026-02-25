"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Image, SamplePost } from "@/lib/types";
import {
  uploadFile,
  createCharacter,
  generateBaseImages,
  listCharacterImages,
  approveImage,
  updateCharacter,
  listSamples,
  agentChat,
  agentConfirm,
  resolveApiUrl,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface OnboardingWizardProps {
  onComplete: (characterId: string) => void;
  onSkip: () => void;
}

type Step = "upload" | "loading-base" | "review" | "create" | "loading-create" | "result";

const STEP_LABELS = ["Upload Photos", "Review Character", "First Creation"];

// Fake samples for when library is empty
const FAKE_SAMPLES: SamplePost[] = [
  { id: "fake-1", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "Rooftop golden hour portrait, warm sunset glow, soft bokeh city skyline background", tags: ["golden-hour"], created_at: "", updated_at: "" },
  { id: "fake-2", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "Beach sunset silhouette, ocean waves, golden light, relaxed summer vibe", tags: ["beach"], created_at: "", updated_at: "" },
  { id: "fake-3", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "Professional studio portrait, clean white background, soft ring light, fashion pose", tags: ["studio"], created_at: "", updated_at: "" },
  { id: "fake-4", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "City night portrait, neon lights reflection, cinematic urban mood, rain-slicked streets", tags: ["night"], created_at: "", updated_at: "" },
  { id: "fake-5", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "Garden morning light, flowers and greenery, natural fresh look, dappled sunlight", tags: ["garden"], created_at: "", updated_at: "" },
  { id: "fake-6", creator_name: "", source_url: "", media_type: "image", media_url: "", thumbnail_url: "", caption: "Cozy indoor scene, warm lamp light, soft sweater, reading by the window, autumn mood", tags: ["indoor"], created_at: "", updated_at: "" },
];

const FAKE_GRADIENTS = [
  "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
];

const FAKE_LABELS = [
  "Rooftop Golden Hour",
  "Beach Sunset",
  "Studio Portrait",
  "City Night",
  "Garden Morning",
  "Cozy Indoor",
];

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex justify-center gap-0 py-6">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                i <= current
                  ? "bg-white text-black"
                  : "bg-[#333] text-gray-500"
              }`}
            >
              {i < current ? "\u2713" : i + 1}
            </div>
            <span
              className={`text-sm font-medium font-mono ${
                i <= current ? "text-white" : "text-gray-500"
              }`}
            >
              {label}
            </span>
          </div>
          {i < 2 && (
            <div
              className={`w-16 h-px mx-3 ${
                i < current ? "bg-white" : "bg-[#333]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Steady 30s progress timer: 0→99 over 30s, stays at 99 until done
function useProgressTimer(active: boolean) {
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    doneRef.current = false;
    setProgress(0);

    const startTime = Date.now();
    const duration = 45_000; // 45 seconds (includes prompt optimization)

    const iv = setInterval(() => {
      if (doneRef.current) return;
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 99, 99);
      setProgress(Math.round(pct));
    }, 300);

    return () => clearInterval(iv);
  }, [active]);

  const finish = useCallback(() => {
    doneRef.current = true;
    setProgress(100);
  }, []);

  const reset = useCallback(() => {
    doneRef.current = true;
    setProgress(0);
  }, []);

  return { progress, finish, reset };
}

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>("upload");

  // Upload step
  const [referenceFiles, setReferenceFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [description, setDescription] = useState("");
  const [gender, setGender] = useState("female");

  // Loading
  const isLoading = step === "loading-base" || step === "loading-create";
  const { progress, finish: finishProgress, reset: resetProgress } = useProgressTimer(isLoading);
  const [error, setError] = useState<string | null>(null);

  // Review step
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [characterName, setCharacterName] = useState("My Character");
  const [baseImages, setBaseImages] = useState<Image[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Create step
  const [samples, setSamples] = useState<SamplePost[]>([]);
  const [selectedSample, setSelectedSample] = useState<SamplePost | null>(null);
  const [prompt, setPrompt] = useState("");

  // Result step
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  // ── Upload handlers ──
  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const newEntries = imageFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setReferenceFiles((prev) => [...prev, ...newEntries]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setReferenceFiles((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Create character ──
  const handleCreateCharacter = async () => {
    if (referenceFiles.length === 0 && !description.trim()) return;
    setError(null);
    setStep("loading-base");

    try {
      // Upload reference images
      let uploadedPaths: string[] = [];
      if (referenceFiles.length > 0) {
        const results = await Promise.all(
          referenceFiles.map((rf) => uploadFile(rf.file))
        );
        uploadedPaths = results.map((r) => r.url);
      }

      // Create character
      const desc = description.trim() || "AI character";
      const created = await createCharacter({
        name: characterName,
        description: desc,
        gender: gender || undefined,
      });
      setCharacterId(created.id);

      // Generate base images
      await generateBaseImages(created.id, uploadedPaths.length > 0 ? uploadedPaths : undefined);
      refreshUser();

      // Poll for base images to complete
      await pollBaseImages(created.id);
    } catch (err) {
      resetProgress();
      if (err instanceof ApiError && err.status === 402) {
        setError("Insufficient tokens to generate base images.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to create character");
      }
      setStep("upload");
      refreshUser();
    }
  };

  // Poll base images until all 3 are completed
  const pollBaseImages = async (charId: string) => {
    const maxPolls = 120;
    let polls = 0;

    return new Promise<void>((resolve, reject) => {
      const poll = async () => {
        try {
          const imgs = await listCharacterImages(charId);
          const baseImgs = imgs.filter((img) => img.type === "base");
          const completed = baseImgs.filter(
            (img) => img.status === "completed" && img.image_url
          );
          const failed = baseImgs.filter((img) => img.status === "failed");

          if (completed.length + failed.length >= 3) {
            setBaseImages(completed);
            if (completed.length === 0) {
              reject(new Error("All base images failed to generate"));
              return;
            }
            finishProgress();
            setTimeout(() => setStep("review"), 600);
            resolve();
            return;
          }

          polls++;
          if (polls >= maxPolls) {
            if (completed.length > 0) {
              setBaseImages(completed);
              finishProgress();
              setTimeout(() => setStep("review"), 600);
              resolve();
            } else {
              reject(new Error("Base image generation timed out"));
            }
            return;
          }

          setTimeout(poll, 3000);
        } catch (err) {
          polls++;
          if (polls >= maxPolls) {
            reject(err);
          } else {
            setTimeout(poll, 3000);
          }
        }
      };

      setTimeout(poll, 3000);
    });
  };

  // ── Review step handlers ──
  const handleApprove = async (imageId: string) => {
    try {
      await approveImage(imageId);
      setApprovedIds((prev) => { const next = new Set(Array.from(prev)); next.add(imageId); return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve image");
    }
  };

  const handleApproveAll = async () => {
    const unapproved = baseImages.filter((img) => !approvedIds.has(img.id));
    try {
      await Promise.all(unapproved.map((img) => approveImage(img.id)));
      const allIds = new Set<string>();
      baseImages.forEach((img) => allIds.add(img.id));
      setApprovedIds(allIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve images");
    }
  };

  const handleContinueToCreate = async () => {
    // Update character name if changed
    if (characterId && characterName.trim()) {
      try {
        await updateCharacter(characterId, { name: characterName.trim() });
      } catch {
        // Non-critical
      }
    }

    // Fetch sample images; fall back to fakes if empty
    try {
      const sampleList = await listSamples({ limit: 6 });
      setSamples(sampleList.length > 0 ? sampleList : FAKE_SAMPLES);
    } catch {
      setSamples(FAKE_SAMPLES);
    }

    setStep("create");
  };

  // ── Create first image (same flow as studio inspiration) ──
  const handleGenerateFirstImage = async () => {
    if (!characterId) return;
    if (!selectedSample && !prompt.trim()) return;

    setError(null);
    setStep("loading-create");

    try {
      const finalPrompt = prompt.trim() || (selectedSample?.caption || "beautiful portrait photo, professional lighting");

      // Only use real samples as reference images (not fake gradient placeholders)
      const hasRealSample = selectedSample && !selectedSample.id.startsWith("fake-") && selectedSample.media_url;
      const refPath = hasRealSample ? selectedSample.media_url : undefined;

      // Snapshot existing image IDs so we can detect the new one later
      const existingImages = await listCharacterImages(characterId);
      const existingIds = new Set(existingImages.map((img) => img.id));

      // Phase 1: agentChat — PromptOptimizer analyzes reference image via GPT-4V
      // and generates a Seedream-optimized prompt with image-order instructions
      const chatResponse = await agentChat({
        message: finalPrompt,
        character_id: characterId,
        session_id: null,
        reference_image_path: refPath ?? null,
        reference_image_mode: refPath ? "pose_background" : null,
      });

      // Phase 2: Auto-confirm to start background generation
      if (chatResponse.state === "awaiting_confirmation" && chatResponse.pending_generation) {
        await agentConfirm({
          session_id: chatResponse.session_id,
          aspect_ratio: "9:16",
          character_id: characterId,
          pending_generation: chatResponse.pending_generation,
        });
        refreshUser();

        // Phase 3: Poll for the newly generated image
        let polls = 0;
        const maxPolls = 60;

        const pollImage = async () => {
          try {
            const allImages = await listCharacterImages(characterId);
            const newImages = allImages.filter(
              (img) => !existingIds.has(img.id) && img.type === "content"
            );

            const completed = newImages.find(
              (img) => img.status === "completed" && img.image_url
            );
            if (completed) {
              finishProgress();
              setGeneratedImageUrl(completed.image_url!);
              setTimeout(() => setStep("result"), 600);
              return;
            }

            const failed = newImages.find((img) => img.status === "failed");
            if (failed) {
              resetProgress();
              setError(failed.error_message || "Generation failed");
              setStep("create");
              refreshUser();
              return;
            }

            polls++;
            if (polls < maxPolls) {
              setTimeout(pollImage, 3000);
            } else {
              resetProgress();
              setError("Generation timed out");
              setStep("create");
            }
          } catch {
            polls++;
            if (polls < maxPolls) {
              setTimeout(pollImage, 3000);
            } else {
              resetProgress();
              setError("Failed to check generation status");
              setStep("create");
            }
          }
        };

        setTimeout(pollImage, 3000);
      } else {
        // Agent didn't return a generation confirmation — fallback error
        resetProgress();
        setError("Could not start image generation. Please try again.");
        setStep("create");
      }
    } catch (err) {
      resetProgress();
      if (err instanceof ApiError && err.status === 402) {
        setError("Insufficient tokens.");
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
      setStep("create");
      refreshUser();
    }
  };

  // ── Top bar ──
  const topBar = (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
      <h1 className="text-lg font-bold font-mono tracking-tight text-white">
        Character Setup
      </h1>
      <button
        onClick={onSkip}
        className="text-sm text-gray-400 hover:text-white transition-colors font-mono"
      >
        Skip Setup &rarr;
      </button>
    </div>
  );

  // ── Loading screen ──
  if (step === "loading-base" || step === "loading-create") {
    const title = step === "loading-base" ? `Creating ${characterName}...` : "Generating Your Image...";
    const subtitle = step === "loading-base" ? "Generating 3 base images" : "30-60 seconds";

    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {topBar}
        <Stepper current={step === "loading-base" ? 0 : 2} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            {/* Circular progress */}
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="#333" strokeWidth="4" />
                <circle
                  cx="48" cy="48" r="42" fill="none"
                  stroke="#ffffff" strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold font-mono">
                {progress}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold font-mono mb-2">{title}</h2>
              <p className="text-gray-400 font-mono text-sm">{subtitle}</p>
            </div>
            {/* Progress bar */}
            <div className="w-72 mx-auto">
              <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-400 font-mono">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 0: Upload Photos ──
  if (step === "upload") {
    const canCreate = referenceFiles.length > 0 || description.trim().length > 0;

    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {topBar}
        <Stepper current={0} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-lg w-full text-center space-y-6">
            <h1 className="text-3xl font-bold font-mono">Upload Your Photos</h1>
            <p className="text-gray-400 font-mono text-sm">
              Upload at least 1 photo to create your AI character. More photos = better accuracy.
            </p>

            {/* Upload area */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAddFiles}
              className="hidden"
            />

            {referenceFiles.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#333] rounded-2xl p-12 cursor-pointer hover:border-white/30 transition-colors group"
              >
                <div className="text-gray-500 group-hover:text-white transition-colors">
                  <div className="flex justify-center mb-4 text-4xl">+</div>
                  <p className="font-medium text-white mb-1 font-mono">
                    Click to upload or drag & drop
                  </p>
                  <p className="text-sm text-gray-500 font-mono">
                    JPG, PNG &bull; Clear face, good lighting
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center gap-3 flex-wrap">
                  {referenceFiles.map((rf, i) => (
                    <div
                      key={i}
                      className="w-24 h-24 rounded-xl overflow-hidden border border-[#333] relative group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={rf.previewUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleRemoveFile(i)}
                        className="absolute inset-0 bg-black/60 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-mono"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-[#333] flex items-center justify-center text-gray-500 hover:border-white/30 hover:text-white cursor-pointer transition-colors text-2xl"
                  >
                    +
                  </div>
                </div>
                <p className="text-white text-sm font-medium font-mono">
                  {referenceFiles.length} photo{referenceFiles.length > 1 ? "s" : ""} uploaded
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-[#333]" />
              <span className="text-sm text-gray-500 font-mono">or describe</span>
              <div className="flex-1 h-px bg-[#333]" />
            </div>

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your character... e.g. young asian woman, long black hair, slim build"
              rows={3}
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-4 py-3 text-sm text-white font-mono focus:border-white/30 focus:outline-none resize-none"
            />

            {/* Gender */}
            <div className="flex gap-3 justify-center">
              {["female", "male"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`px-6 py-2 rounded-lg text-sm font-mono font-bold uppercase tracking-wide border transition-colors ${
                    gender === g
                      ? "border-white bg-white/10 text-white"
                      : "border-[#333] bg-[#0b0b0b] text-gray-400 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 font-mono">{error}</p>
            )}

            {/* Create button */}
            <button
              onClick={handleCreateCharacter}
              disabled={!canCreate}
              className="w-full rounded-lg bg-white px-4 py-3 text-sm font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create My Character &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Review Character ──
  if (step === "review") {
    const angles = ["Front View", "3/4 Angle", "Side Profile"];
    const allApproved = baseImages.length > 0 && baseImages.every((img) => approvedIds.has(img.id));
    const anyUnapproved = baseImages.some((img) => !approvedIds.has(img.id));

    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {topBar}
        <Stepper current={1} />
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="max-w-3xl w-full text-center space-y-8">
            <div>
              <h1 className="text-3xl font-bold font-mono mb-2">Review Your Character</h1>
              <p className="text-gray-400 font-mono text-sm">
                Approve each angle to establish your character&apos;s appearance.
              </p>
            </div>

            {/* Character name input */}
            <div className="max-w-xs mx-auto">
              <label className="block text-xs text-gray-400 mb-2 text-left font-mono uppercase tracking-widest">
                Character Name
              </label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-4 py-3 text-white font-mono focus:border-white/30 focus:outline-none transition-colors"
              />
            </div>

            {/* Base images grid */}
            <div className="grid grid-cols-3 gap-4">
              {baseImages.map((img, i) => {
                const isApproved = approvedIds.has(img.id);
                return (
                  <div
                    key={img.id}
                    className="bg-[#111] rounded-2xl border border-[#333] overflow-hidden"
                  >
                    <div className="aspect-[9/16] bg-[#0b0b0b] relative overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveApiUrl(img.image_url!)}
                        alt={angles[i] || "Base"}
                        className="w-full h-full object-cover"
                      />
                      {isApproved && (
                        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">
                          &#10003;
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium font-mono">{angles[i] || `Image ${i + 1}`}</span>
                        {isApproved ? (
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                            Approved
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#cbcbcb]/20 text-[#cbcbcb]">
                            Ready
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleApprove(img.id)}
                        disabled={isApproved}
                        className={`w-full py-2 text-xs font-semibold font-mono uppercase tracking-wide rounded-lg transition-colors ${
                          isApproved
                            ? "bg-green-500/20 text-green-400 cursor-default"
                            : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        }`}
                      >
                        {isApproved ? "Approved" : "Approve"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Approve All */}
            {anyUnapproved && (
              <button
                onClick={handleApproveAll}
                className="text-sm text-white hover:text-gray-300 font-medium font-mono transition-colors"
              >
                Approve All
              </button>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 font-mono">{error}</p>
            )}

            {/* Continue */}
            {allApproved && (
              <button
                onClick={handleContinueToCreate}
                className="rounded-lg bg-white px-8 py-3 text-sm font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 transition-colors"
              >
                Looks Great &mdash; Continue &rarr;
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Create Your First Image ──
  if (step === "create") {
    const canGenerate = !!selectedSample || prompt.trim().length > 0;
    const isFakeSamples = samples.length > 0 && samples[0].id.startsWith("fake-");

    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {topBar}
        <Stepper current={2} />
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="max-w-2xl w-full text-center space-y-8">
            <div>
              <h1 className="text-3xl font-bold font-mono mb-2">Create Your First Image</h1>
              <p className="text-gray-400 font-mono text-sm">
                Pick a style from the library or describe what you want.
              </p>
            </div>

            {/* Sample grid */}
            {samples.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {samples.map((sample, idx) => (
                  <div
                    key={sample.id}
                    onClick={() => {
                      setSelectedSample(selectedSample?.id === sample.id ? null : sample);
                      if (selectedSample?.id !== sample.id && sample.caption) {
                        setPrompt(sample.caption);
                      } else if (selectedSample?.id === sample.id) {
                        setPrompt("");
                      }
                    }}
                    className={`rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
                      selectedSample?.id === sample.id
                        ? "border-white scale-[1.02]"
                        : "border-transparent hover:border-[#333]"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-[#0b0b0b] overflow-hidden">
                      {isFakeSamples ? (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ background: FAKE_GRADIENTS[idx] || FAKE_GRADIENTS[0] }}
                        >
                          <span className="text-white/80 text-xs font-mono font-bold drop-shadow">
                            {FAKE_LABELS[idx]}
                          </span>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveApiUrl(sample.thumbnail_url || sample.media_url)}
                          alt={sample.caption || "Sample"}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="bg-[#111] p-2">
                      <p className="text-xs text-gray-400 font-mono truncate">
                        {isFakeSamples ? FAKE_LABELS[idx] : (sample.caption || "Sample")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-[#333]" />
              <span className="text-sm text-gray-500 font-mono">or describe</span>
              <div className="flex-1 h-px bg-[#333]" />
            </div>

            {/* Custom prompt */}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Golden hour portrait on a rooftop, soft bokeh, warm tones..."
              rows={3}
              className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-4 py-3 text-sm text-white font-mono placeholder-gray-600 focus:border-white/30 focus:outline-none resize-none"
            />

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 font-mono">{error}</p>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerateFirstImage}
              disabled={!canGenerate}
              className={`rounded-lg bg-white px-8 py-3 text-sm font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 transition-colors ${
                !canGenerate ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              Generate Image
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Result ──
  if (step === "result") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {topBar}
        <Stepper current={2} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-6 max-w-lg w-full">
            {generatedImageUrl && (
              <div className="relative mx-auto max-w-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveApiUrl(generatedImageUrl)}
                  alt="Generated"
                  className="w-full rounded-2xl border border-[#333]"
                />
              </div>
            )}

            <div>
              <h2 className="text-2xl font-bold font-mono mb-2">Your First Creation!</h2>
              <p className="text-gray-400 font-mono text-sm">
                {characterName} is ready. Enter the studio to create more content.
              </p>
            </div>

            <button
              onClick={() => characterId && onComplete(characterId)}
              className="rounded-lg bg-white px-8 py-3 text-sm font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 transition-colors"
            >
              Enter Studio &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
