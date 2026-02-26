import { useState, useEffect } from "react";
import { Btn, Badge, I, ParrotLogo, ProgBar, TMPLS, ANGLES } from "./shared";

const Stepper = ({ current }) => {
  const steps = ["Upload Photos", "Review Character", "First Creation"];
  return (
    <div className="flex justify-center gap-0 py-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i < current
                  ? "bg-amber-500 text-black"
                  : i === current
                  ? "bg-amber-500 text-black"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                i <= current ? "text-white" : "text-gray-500"
              }`}
            >
              {s}
            </span>
          </div>
          {i < 2 && (
            <div
              className={`w-16 h-px mx-3 ${
                i < current ? "bg-amber-500" : "bg-gray-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default function OnboardingFlow({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [uploaded, setUploaded] = useState(false);
  const [name, setName] = useState("My Character");
  const [bases, setBases] = useState([
    { st: "gen", versions: [{ id: 0 }], selected: 0 },
    { st: "gen", versions: [{ id: 0 }], selected: 0 },
    { st: "gen", versions: [{ id: 0 }], selected: 0 },
  ]);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [prog, setProg] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [inspoUploaded, setInspoUploaded] = useState(false);
  const [resultVersions, setResultVersions] = useState([{ id: 0 }]);
  const [resultSelected, setResultSelected] = useState(0);
  const [resultRetrying, setResultRetrying] = useState(false);
  const [editText, setEditText] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    if (step !== 3) return;
    setProg(0);
    const iv = setInterval(() => {
      setProg((p) => {
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => setStep(4), 400);
          return 100;
        }
        return p + 2;
      });
    }, 80);
    return () => clearInterval(iv);
  }, [step]);

  const topBar = (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <ParrotLogo sz={28} />
        <span className="text-lg font-bold tracking-tight">
          Parrot Studios
        </span>
      </div>
      <button
        onClick={onSkip}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        Skip Setup →
      </button>
    </div>
  );

  const handleCreateCharacter = () => {
    setProg(0);
    setStep("loading");
    const iv = setInterval(() => {
      setProg((p) => {
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => {
            setBases([
              { st: "pending", versions: [{ id: 0 }], selected: 0 },
              { st: "pending", versions: [{ id: 0 }], selected: 0 },
              { st: "pending", versions: [{ id: 0 }], selected: 0 },
            ]);
            setStep(1);
          }, 400);
          return 100;
        }
        return p + 3;
      });
    }, 60);
  };

  // ── Loading screen ──
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={0} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ParrotLogo sz={36} />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Creating {name}...</h2>
              <p className="text-gray-400">Generating 3 base images</p>
            </div>
            <div className="w-72 mx-auto">
              <ProgBar pct={prog} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 0: Upload Photos ──
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={0} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-lg w-full text-center space-y-6">
            <div className="flex justify-center"><ParrotLogo sz={52} /></div>
            <h1 className="text-3xl font-bold">Upload Your Photos</h1>
            <p className="text-gray-400">
              Upload at least 1 photo to create your AI character. More photos =
              better accuracy.
            </p>

            {!uploaded ? (
              <div
                onClick={() => setUploaded(true)}
                className="border-2 border-dashed border-gray-700 rounded-2xl p-12 cursor-pointer hover:border-amber-500/50 transition-colors group"
              >
                <div className="text-gray-500 group-hover:text-amber-400 transition-colors">
                  <div className="flex justify-center mb-4">
                    <ParrotLogo sz={48} color="#9ca3af" />
                  </div>
                  <p className="font-medium text-white mb-1">
                    Click to upload or drag &amp; drop
                  </p>
                  <p className="text-sm text-gray-500">
                    JPG, PNG • Clear face, good lighting
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-center gap-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-24 h-24 bg-gray-800 rounded-xl flex items-center justify-center border border-gray-700"
                    >
                      <ParrotLogo sz={40} color={["#c084fc", "#fbbf24", "#22d3ee"][i]} />
                    </div>
                  ))}
                </div>
                <p className="text-green-400 text-sm font-medium">
                  ✓ 3 photos uploaded
                </p>
                <div>
                  <label className="block text-sm text-gray-400 mb-2 text-left">
                    Character Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <Btn primary className="w-full" onClick={handleCreateCharacter}>
                  Create My Character →
                </Btn>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Review Character ──
  if (step === 1) {
    const allApproved = bases.every((b) => b.st === "approved");
    const vColors = ["from-purple-400 to-pink-400", "from-amber-400 to-orange-400", "from-blue-400 to-cyan-400", "from-green-400 to-emerald-400", "from-rose-400 to-red-400"];

    const handleRetry = (idx) => {
      setBases((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], st: "retrying" };
        return next;
      });
      setTimeout(() => {
        setBases((prev) => {
          const next = [...prev];
          const newId = next[idx].versions.length;
          next[idx] = {
            ...next[idx],
            st: "pending",
            versions: [...next[idx].versions, { id: newId }],
            selected: newId,
          };
          return next;
        });
      }, 1200);
    };

    const handleSelect = (idx, versionIdx) => {
      if (bases[idx].st === "approved" || bases[idx].st === "retrying") return;
      setBases((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], selected: versionIdx };
        return next;
      });
    };

    const handleApprove = (idx) => {
      setBases((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], st: "approved" };
        return next;
      });
    };

    const handleApproveAll = () => {
      setBases((prev) => prev.map((b) => b.st === "retrying" ? b : { ...b, st: "approved" }));
    };

    const anyPending = bases.some((b) => b.st === "pending");
    const noneRetrying = bases.every((b) => b.st !== "retrying");

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={1} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-3xl w-full text-center space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Review Your Character
              </h1>
              <p className="text-gray-400">
                Approve each angle or generate new options. Click thumbnails to compare.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {ANGLES.map((angle, i) => {
                const base = bases[i];
                return (
                  <div
                    key={i}
                    className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden"
                  >
                    <div className="aspect-square bg-gray-800 flex items-center justify-center relative">
                      {base.st === "retrying" ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
                          <span className="text-xs text-gray-500">Generating...</span>
                        </div>
                      ) : (
                        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${vColors[base.selected % vColors.length]} flex items-center justify-center text-2xl font-bold text-white shadow-lg`}>
                          {name[0]}
                        </div>
                      )}
                      {base.st === "approved" && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <I n="check" s={12} />
                        </div>
                      )}
                      {base.versions.length > 1 && (
                        <span className="absolute bottom-2 left-2 text-[10px] text-gray-500 bg-gray-900/80 px-1.5 py-0.5 rounded">
                          v{base.selected + 1} of {base.versions.length}
                        </span>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{angle}</span>
                        {base.st === "approved" ? (
                          <Badge color="green">APPROVED</Badge>
                        ) : base.st === "retrying" ? (
                          <Badge color="amber">GENERATING</Badge>
                        ) : (
                          <Badge color="green">READY</Badge>
                        )}
                      </div>

                      {base.versions.length > 1 && (
                        <div className="flex gap-1.5 justify-center py-1">
                          {base.versions.map((v, vi) => (
                            <button
                              key={v.id}
                              onClick={() => handleSelect(i, vi)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all bg-gradient-to-br ${vColors[vi % vColors.length]} ${
                                base.selected === vi
                                  ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-gray-900 scale-105"
                                  : "opacity-40 hover:opacity-70"
                              }`}
                            >
                              {vi + 1}
                            </button>
                          ))}
                          {base.st === "retrying" && (
                            <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleApprove(i)}
                          disabled={base.st === "approved" || base.st === "retrying"}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            base.st === "approved"
                              ? "bg-green-500/20 text-green-400 cursor-default"
                              : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                          }`}
                        >
                          {base.st === "approved" ? "✓ Approved" : "✓ Approve"}
                        </button>
                        <button
                          onClick={() => handleRetry(i)}
                          disabled={base.st === "retrying" || base.st === "approved"}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                            base.st === "approved"
                              ? "bg-gray-800/50 text-gray-600 cursor-default"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          + New Option
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!allApproved && anyPending && noneRetrying && (
              <button
                onClick={handleApproveAll}
                className="text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
              >
                ✓ Approve All
              </button>
            )}

            {allApproved && (
              <Btn primary className="mx-auto" onClick={() => setStep(2)}>
                Looks Great — Continue →
              </Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: First Creation (style picker) ──
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={2} />
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="max-w-2xl w-full text-center space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Create Your First Image
              </h1>
              <p className="text-gray-400">
                Choose how you want to create — pick a style, upload
                inspiration, or describe what you want.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {TMPLS.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedStyle(t)}
                  className={`rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
                    selectedStyle?.id === t.id
                      ? "border-amber-500 scale-[1.02]"
                      : "border-transparent hover:border-gray-700"
                  }`}
                >
                  <div
                    className="aspect-[4/3] flex items-center justify-center"
                    style={{ background: t.bg }}
                  >
                    <ParrotLogo sz={36} color="rgba(0,0,0,0.3)" />
                  </div>
                  <div className="bg-gray-900 p-3 text-left">
                    <p className="text-sm font-medium">{t.n}</p>
                    <p className="text-xs text-gray-500">{t.c}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-sm text-gray-500">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-left">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">Upload Inspiration</p>
                {!inspoUploaded ? (
                  <div
                    onClick={() => setInspoUploaded(true)}
                    className="border-2 border-dashed border-gray-700 rounded-xl p-6 cursor-pointer hover:border-amber-500/50 transition-colors group flex flex-col items-center justify-center gap-2 h-32"
                  >
                    <I n="upload" s={24} />
                    <span className="text-xs text-gray-500 group-hover:text-gray-400">Drop image here</span>
                  </div>
                ) : (
                  <div className="border border-green-500/30 bg-green-500/5 rounded-xl p-4 flex items-center gap-3 h-32">
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-amber-400/30 to-orange-500/30 flex items-center justify-center">
                      <ParrotLogo sz={24} color="rgba(255,255,255,0.3)" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-green-400 font-medium">✓ Image uploaded</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">reference_photo.jpg</p>
                    </div>
                    <button onClick={() => setInspoUploaded(false)} className="text-gray-500 hover:text-white"><I n="x" s={14} /></button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">Describe What You Want</p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Golden hour portrait on a rooftop, soft bokeh, warm tones..."
                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              5 credits per image • You have 50 credits
            </p>

            <Btn
              primary
              disabled={!selectedStyle}
              className={`mx-auto ${!selectedStyle ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => selectedStyle && setStep(3)}
            >
              Generate Image
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Generating ──
  if (step === 3) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={2} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ParrotLogo sz={36} />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Creating Your Image...
              </h2>
              <p className="text-gray-400">15-30 seconds</p>
            </div>
            <div className="w-72 mx-auto">
              <ProgBar pct={prog} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Result ──
  if (step === 4) {
    const rColors = ["from-amber-400 to-orange-500", "from-purple-400 to-pink-500", "from-blue-400 to-cyan-500", "from-green-400 to-emerald-500", "from-rose-400 to-red-500"];

    const handleResultRetry = () => {
      setResultRetrying(true);
      setTimeout(() => {
        const newId = resultVersions.length;
        setResultVersions((prev) => [...prev, { id: newId }]);
        setResultSelected(newId);
        setResultRetrying(false);
      }, 1500);
    };

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {topBar}
        <Stepper current={2} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-6 max-w-lg w-full">
            {/* Main preview */}
            <div className="relative">
              <div
                className="w-72 h-72 mx-auto rounded-2xl flex flex-col items-center justify-center gap-3 relative"
                style={{
                  background: selectedStyle?.bg || "linear-gradient(135deg,#f6d365,#fda085)",
                }}
              >
                {resultRetrying ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                    <span className="text-sm font-medium text-black/60">Generating...</span>
                  </div>
                ) : (
                  <>
                    <ParrotLogo sz={56} color="rgba(0,0,0,0.6)" />
                    <span className="text-xl font-bold text-black/80">
                      Your First Creation!
                    </span>
                  </>
                )}
                {resultVersions.length > 1 && (
                  <span className="absolute bottom-3 left-3 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">
                    v{resultSelected + 1} of {resultVersions.length}
                  </span>
                )}
              </div>
            </div>

            {/* Version thumbnails */}
            {resultVersions.length > 1 && (
              <div className="flex gap-2 justify-center">
                {resultVersions.map((v, vi) => (
                  <button
                    key={v.id}
                    onClick={() => setResultSelected(vi)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all bg-gradient-to-br ${rColors[vi % rColors.length]} ${
                      resultSelected === vi
                        ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-950 scale-110"
                        : "opacity-40 hover:opacity-70"
                    }`}
                  >
                    {vi + 1}
                  </button>
                ))}
                {resultRetrying && (
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <Btn sm>
                <I n="download" s={16} /> Download
              </Btn>
              <Btn sm onClick={() => setShowEdit(!showEdit)}>
                <I n="edit" s={16} /> Edit
              </Btn>
              <Btn sm onClick={handleResultRetry} disabled={resultRetrying}>
                <I n="refresh" s={16} /> Retry
              </Btn>
              <Btn sm onClick={() => setShowVideo(!showVideo)}>
                <I n="video" s={16} /> Video
              </Btn>
            </div>

            {/* Edit panel */}
            {showEdit && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left space-y-3">
                <p className="text-xs font-medium text-gray-400">Edit your creation</p>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="Describe what you'd like to change... e.g. 'Make the lighting warmer' or 'Change to evening setting'"
                  className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <Btn sm onClick={() => setShowEdit(false)}>Cancel</Btn>
                  <Btn sm primary onClick={() => { setShowEdit(false); handleResultRetry(); }}>Apply Edits</Btn>
                </div>
              </div>
            )}

            {/* Video panel */}
            {showVideo && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left space-y-3">
                <p className="text-xs font-medium text-gray-400">Turn into video</p>
                <div className="grid grid-cols-4 gap-2">
                  {["5s", "10s", "15s", "30s"].map((d) => (
                    <button
                      key={d}
                      className="py-2 rounded-lg border border-gray-700 text-center hover:border-amber-500/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-white">{d}</p>
                      <p className="text-[10px] text-gray-500">{{"5s": 10, "10s": 20, "15s": 35, "30s": 60}[d]} cr</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Btn sm onClick={() => setShowVideo(false)}>Cancel</Btn>
                  <Btn sm primary>Generate Video</Btn>
                </div>
              </div>
            )}

            <Btn primary className="mx-auto" onClick={onComplete}>
              Enter Studio →
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
