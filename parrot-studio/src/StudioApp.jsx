import { useState, useEffect } from "react";
import { Btn, Badge, I, ParrotLogo, ProgBar, TMPLS, MODES, ANGLES, COSTS } from "./shared";

const CATS = ["All", "Fashion", "Lifestyle", "Portrait", "Street"];
const MOTIONS = [
  { id: "zoom_in", n: "Zoom In", emoji: "🔍" },
  { id: "zoom_out", n: "Zoom Out", emoji: "🔭" },
  { id: "pan_l", n: "Pan Left", emoji: "⬅️" },
  { id: "pan_r", n: "Pan Right", emoji: "➡️" },
  { id: "orbit", n: "Orbit", emoji: "🔄" },
  { id: "dolly", n: "Dolly", emoji: "🎬" },
];
const VOICES = ["Natural Female", "Natural Male", "Warm Female", "Deep Male", "Narrator", "Whisper"];
const CHIPS = ["Golden hour lighting", "Urban setting", "Soft bokeh", "Cinematic", "Vintage film"];
const FILTER_TABS = ["All", "Base", "Content", "Videos"];

export default function StudioApp({ isAdmin, plan = "pro", onAdmin, onNewCharacter, onLogout }) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [view, setView] = useState("studio");
  const [hist, setHist] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [tmpl, setTmpl] = useState(null);
  const [mode, setMode] = useState("pose_bg");
  const [prompt, setPrompt] = useState("");
  const [hasRef, setHasRef] = useState(false);
  const [cat, setCat] = useState("All");
  const [prog, setProg] = useState(0);
  const [vLen, setVLen] = useState("5s");
  const [vMot, setVMot] = useState("zoom_in");
  const [vAud, setVAud] = useState(null);
  const [lImg, setLImg] = useState(null);
  const [lAud, setLAud] = useState(null);
  const [lTxt, setLTxt] = useState("");
  const [vStyle, setVStyle] = useState("natural_f");
  const [gTab, setGTab] = useState("All");
  const [galView, setGalView] = useState("mine");
  const [remixFrom, setRemixFrom] = useState(null);
  const [credits] = useState(5059);
  const [shareModal, setShareModal] = useState(null);
  const [activeChar, setActiveChar] = useState("sarah");
  const [charDropOpen, setCharDropOpen] = useState(false);
  const CHARS = [
    { id: "sarah", name: "Sarah's Character", gens: 142, status: "ready" },
    { id: "alex", name: "Alex Business", gens: 38, status: "draft" },
  ];

  const go = v => { setHist(h => [...h, view]); setView(v); };
  const back = () => { setView("studio"); setHist([]); };

  useEffect(() => {
    if (["generating", "vgen", "lgen"].includes(view)) {
      setProg(0);
      const sp = view === "generating" ? 3 : 2;
      const nx = view === "generating" ? "result" : view === "vgen" ? "vresult" : "lresult";
      const t = setInterval(() => setProg(p => { if (p >= 100) { clearInterval(t); setTimeout(() => go(nx), 300); return 100; } return p + sp; }), 80);
      return () => clearInterval(t);
    }
  }, [view]);

  const doRemix = (src) => { setRemixFrom(src); setPrompt(src?.n ? src.n + " style" : "Golden Hour"); setHasRef(true); setMode("pose_bg"); go("prompt"); };

  /* ── Nav ── */
  const Nav = (
    <div className="relative z-50 flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {view !== "studio" && (
          <button onClick={back} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><I n="chevL" s={18} /></button>
        )}
        <ParrotLogo sz={26} />
        <span className="text-sm font-semibold text-white tracking-tight">Parrot Studio</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
          <span className="text-amber-400 text-xs">✦</span>
          <span className="text-xs font-semibold text-amber-300">{credits.toLocaleString()} Credits</span>
        </button>
        <button className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><I n="bell" s={18} /></button>
        <div className="relative">
          <button onClick={() => setShowDrop(!showDrop)} className="relative w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-black">
            SC
            {isAdmin && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border-2 border-gray-950" />}
          </button>
          {showDrop && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDrop(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                  <p className="font-semibold text-white text-sm">Sarah Chen</p>
                  <p className="text-xs text-gray-400">sarah@email.com</p>
                  <Badge color="amber">Pro</Badge>
                </div>
                <div className="p-1">
                  {["Profile", "Subscription", "Settings"].map(item => (
                    <button key={item} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg">{item}</button>
                  ))}
                  {isAdmin && (
                    <button onClick={() => { setShowDrop(false); onAdmin(); }} className="w-full text-left px-3 py-2 text-sm text-purple-400 hover:bg-gray-800 rounded-lg flex items-center gap-2">
                      <I n="shield" s={14} /> Switch to Admin
                    </button>
                  )}
                </div>
                <div className="border-t border-gray-800 p-1">
                  <button onClick={() => { setShowDrop(false); onLogout(); }} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800 rounded-lg">Sign Out</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  /* ── Sidebar ── */
  const currentChar = CHARS.find(c => c.id === activeChar) || CHARS[0];
  const baseColors = ["from-purple-400 to-pink-400", "from-amber-400 to-orange-400", "from-blue-400 to-cyan-400"];

  const Sidebar = (
    <div className="w-56 border-r border-gray-800 bg-gray-950 flex flex-col shrink-0">
      <div className="flex-1 overflow-y-auto">
        {/* My Characters header */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">My Characters</p>
            <button
              onClick={() => plan === "free" ? setShowUpgradeModal(true) : onNewCharacter?.()}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              <I n="plus" s={12} /> New
            </button>
          </div>

          {/* Character card with dropdown */}
          <div className="relative">
            <button
              onClick={() => setCharDropOpen(!charDropOpen)}
              className="w-full rounded-xl overflow-hidden border border-gray-700 hover:border-amber-500/50 transition-colors text-left"
            >
              <div className="h-20 bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-base font-bold text-black">
                  {currentChar.name[0]}
                </div>
              </div>
              <div className="p-2 bg-gray-900 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{currentChar.name}</p>
                  <Badge color={currentChar.status === "ready" ? "green" : "amber"}>{currentChar.status}</Badge>
                </div>
                <I n="chevR" s={12} />
              </div>
            </button>
            {charDropOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setCharDropOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-40 overflow-hidden">
                  {CHARS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveChar(c.id); setCharDropOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors ${activeChar === c.id ? "bg-gray-800" : ""}`}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[10px] font-bold text-black">{c.name[0]}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-500">{c.gens} generations</p>
                      </div>
                      <Badge color={c.status === "ready" ? "green" : "amber"}>{c.status}</Badge>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Base images */}
        <div className="p-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Base Images</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ANGLES.map((a, i) => (
              <div key={a} className="relative group">
                <div className={`aspect-square rounded-lg bg-gradient-to-br ${baseColors[i]} flex items-center justify-center cursor-pointer border border-transparent hover:border-amber-500/50 transition-colors`}>
                  <span className="text-white text-xs font-bold">{currentChar.name[0]}</span>
                </div>
                <p className="text-[9px] text-gray-500 text-center mt-0.5 truncate">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-gray-800 space-y-1.5">
        <Btn primary className="w-full text-xs !py-2" onClick={() => go("prompt")}><I n="sparkle" s={14} /> Create Image</Btn>
        <Btn className="w-full text-xs !py-2" onClick={() => go("video")}><I n="video" s={14} /> Video</Btn>
        <Btn className="w-full text-xs !py-2" onClick={() => go("lipsync")}><I n="msg" s={14} /> Lip Sync</Btn>
        <Btn className="w-full text-xs !py-2" onClick={() => go("templates")}><I n="grid" s={14} /> References</Btn>
      </div>
    </div>
  );

  /* ── Gallery card renderer ── */
  const GalCard = ({ item, type, idx }) => {
    const statuses = ["Published", "Pending", null, "Rejected"];
    const status = statuses[idx % 4];
    return (
      <div className="group relative rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all cursor-pointer">
        <div className="aspect-[3/4] flex items-center justify-center" style={{ background: item.bg || "linear-gradient(135deg,#374151,#1f2937)" }}>
          <ParrotLogo sz={36} color="rgba(0,0,0,0.35)" />
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex gap-2">
            {type === "public" ? (
              <>
                <button onClick={() => doRemix(item)} className="p-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"><I n="refresh" s={16} /></button>
                <button className="p-2 rounded-lg bg-gray-700/60 text-white hover:bg-gray-600/60"><I n="edit" s={16} /></button>
              </>
            ) : (
              <>
                <button className="p-2 rounded-lg bg-gray-700/60 text-white hover:bg-gray-600/60"><I n="edit" s={16} /></button>
                <button onClick={() => go("video")} className="p-2 rounded-lg bg-gray-700/60 text-white hover:bg-gray-600/60"><I n="video" s={16} /></button>
                <button onClick={() => go("lipsync")} className="p-2 rounded-lg bg-gray-700/60 text-white hover:bg-gray-600/60"><I n="msg" s={16} /></button>
                <button onClick={() => setShareModal(item)} className="p-2 rounded-lg bg-gray-700/60 text-white hover:bg-gray-600/60"><I n="ext" s={16} /></button>
              </>
            )}
          </div>
        </div>
        {type === "mine" && status && (
          <div className="absolute top-2 right-2">
            <Badge color={status === "Published" ? "green" : status === "Pending" ? "amber" : "red"}>{status}</Badge>
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className="text-xs font-medium text-white truncate">{item.n || `Creation ${idx + 1}`}</p>
        </div>
      </div>
    );
  };

  /* ── Share Modal ── */
  const ShareModalOverlay = shareModal && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={() => setShareModal(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white"><I n="x" s={18} /></button>
        <h3 className="text-lg font-bold text-white mb-1">Share to Community</h3>
        <p className="text-sm text-gray-400 mb-4">Your creation will be reviewed before appearing in the public gallery.</p>
        <div className="aspect-video rounded-xl mb-4 flex items-center justify-center" style={{ background: shareModal.bg || "linear-gradient(135deg,#374151,#1f2937)" }}>
          <ParrotLogo sz={48} color="rgba(0,0,0,0.35)" />
        </div>
        <label className="text-xs font-medium text-gray-400 block mb-1">Title</label>
        <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-amber-500" defaultValue={shareModal.n || ""} />
        <label className="text-xs font-medium text-gray-400 block mb-1">Description</label>
        <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 resize-none h-20 focus:outline-none focus:border-amber-500" placeholder="Describe your creation..." />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => setShareModal(null)}>Cancel</Btn>
          <Btn primary className="flex-1" onClick={() => setShareModal(null)}><I n="ext" s={14} /> Submit</Btn>
        </div>
      </div>
    </div>
  );

  /* ── Placeholder image ── */
  const Placeholder = ({ label, gradient = "from-amber-400/20 to-orange-500/20", h = "h-full" }) => (
    <div className={`${h} rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-3 border border-gray-800`}>
      <ParrotLogo sz={56} color="rgba(255,255,255,0.15)" />
      {label && <p className="text-sm text-gray-400">{label}</p>}
    </div>
  );

  /* ── Mode Selector ── */
  const ModeSelector = (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400">Reference Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} className={`text-left p-2 rounded-xl border transition-all ${mode === m.id ? "border-amber-500 bg-amber-500/10" : "border-gray-700 bg-gray-800/50 hover:border-gray-600"}`}>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-sm">{m.i}</span>
                <span className="text-[11px] font-medium text-white">{m.n}</span>
              </div>
              {m.rec && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">REC</span>}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 mb-1.5">Additional Instructions</p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Add custom details... e.g. 'warm lighting, soft bokeh, urban rooftop'"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white resize-none h-16 focus:outline-none focus:border-amber-500 placeholder-gray-600"
        />
      </div>
    </div>
  );

  /* ── Cost display ── */
  const CostLine = ({ cost = 8 }) => (
    <div className="flex items-center justify-between text-xs py-2 border-t border-gray-800">
      <span className="text-gray-400">Cost</span>
      <span className="text-amber-400 font-medium">{cost} credits</span>
    </div>
  );

  /* ─────────── VIEW: studio ─────────── */
  if (view === "studio") return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {Nav}
      <div className="flex flex-1 min-h-0">
        {Sidebar}

        {/* Center — Gallery */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5">
              {[["mine","My Gallery"],["public","Community"],["inspiration","Inspiration"]].map(([k,l]) => (
                <button key={k} onClick={() => setGalView(k)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${galView === k ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>{l}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {FILTER_TABS.map(t => (
                <button key={t} onClick={() => setGTab(t)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${gTab === t ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {galView === "mine" && (
              <div className="grid grid-cols-3 gap-3">
                {ANGLES.map((a, i) => (
                  <GalCard key={`a-${i}`} item={{ n: a, bg: `linear-gradient(135deg,${["#667eea,#764ba2","#f6d365,#fda085","#a18cd1,#fbc2eb"][i]})` }} type="mine" idx={i} />
                ))}
                {TMPLS.map((t, i) => (
                  <GalCard key={`t-${t.id}`} item={t} type="mine" idx={i + 3} />
                ))}
              </div>
            )}
            {galView === "public" && (
              <div className="grid grid-cols-3 gap-3">
                {[...TMPLS].reverse().map((t, i) => (
                  <GalCard key={`p-${t.id}`} item={t} type="public" idx={i} />
                ))}
                {TMPLS.map((t, i) => (
                  <GalCard key={`p2-${t.id}`} item={{ ...t, n: t.n + " Remix" }} type="public" idx={i + 6} />
                ))}
              </div>
            )}
            {galView === "inspiration" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Private reference images</p>
                  <Btn sm><I n="upload" s={14} /> Upload</Btn>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-600 hover:border-gray-500 hover:text-gray-400 cursor-pointer transition-colors">
                      <I n="upload" s={24} />
                      <span className="text-xs">Drop or click</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right — Creation Panel */}
        <div className="w-72 border-l border-gray-800 bg-gray-950 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Styles</p>
              <div className="grid grid-cols-2 gap-2">
                {TMPLS.slice(0, 4).map(t => (
                  <button key={t.id} onClick={() => { setTmpl(t); go("tpreview"); }} className="rounded-xl overflow-hidden border border-gray-700 hover:border-amber-500/50 transition-colors group">
                    <div className="aspect-square flex items-center justify-center" style={{ background: t.bg }}><ParrotLogo sz={24} color="rgba(0,0,0,0.35)" /></div>
                    <div className="p-1.5 bg-gray-900"><p className="text-[10px] font-medium text-gray-300 truncate">{t.n}</p></div>
                  </button>
                ))}
              </div>
              <button onClick={() => go("templates")} className="w-full text-center text-xs text-amber-400 hover:text-amber-300 mt-2 py-1">Browse all templates →</button>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Custom Prompt</p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe your image..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white resize-none h-20 focus:outline-none focus:border-amber-500 placeholder-gray-600"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {CHIPS.map(c => (
                  <button key={c} onClick={() => setPrompt(p => p ? p + ", " + c.toLowerCase() : c)} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700 transition-colors">{c}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400">Reference Image</p>
                <button onClick={() => setHasRef(!hasRef)} className={`w-8 h-4.5 rounded-full transition-colors ${hasRef ? "bg-amber-500" : "bg-gray-700"} relative`}>
                  <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${hasRef ? "left-[calc(100%-16px)]" : "left-0.5"}`} />
                </button>
              </div>
              {hasRef && (
                <div className="space-y-2">
                  <div className="h-24 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 text-xs cursor-pointer hover:border-gray-500">
                    <I n="upload" s={16} /><span className="ml-1">Upload reference</span>
                  </div>
                  <div className="flex gap-1">
                    {MODES.slice(0, 3).map(m => (
                      <button key={m.id} onClick={() => setMode(m.id)} className={`flex-1 text-[10px] py-1 rounded-lg border transition-colors ${mode === m.id ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>{m.n}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <CostLine cost={8} />

            <div className="space-y-1.5">
              <Btn primary className="w-full" onClick={() => go("generating")}><I n="sparkle" s={16} /> Generate</Btn>
              <div className="flex gap-1.5">
                <Btn className="flex-1 !text-xs !py-2" onClick={() => go("video")}><I n="video" s={14} /> Video</Btn>
                <Btn className="flex-1 !text-xs !py-2" onClick={() => go("lipsync")}><I n="msg" s={14} /> Lip Sync</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
      {ShareModalOverlay}
    </div>
  );

  /* ─────────── VIEW: templates ─────────── */
  if (view === "templates") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-bold mb-4">Templates</h1>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <I n="search" s={16} />
            <input placeholder="Search templates..." className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 placeholder-gray-500" />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><I n="search" s={16} /></div>
          </div>
        </div>
        <div className="flex gap-2 mb-6">
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${cat === c ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"}`}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {TMPLS.filter(t => cat === "All" || t.c === cat).map(t => (
            <button key={t.id} onClick={() => { setTmpl(t); go("tpreview"); }} className="rounded-2xl overflow-hidden border border-gray-800 hover:border-amber-500/50 transition-all group text-left">
              <div className="aspect-[3/4] flex items-center justify-center" style={{ background: t.bg }}><ParrotLogo sz={40} color="rgba(0,0,0,0.3)" /></div>
              <div className="p-3 bg-gray-900">
                <p className="text-sm font-medium text-white">{t.n}</p>
                <p className="text-xs text-gray-500">{t.c}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: tpreview ─────────── */
  if (view === "tpreview") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <div className="aspect-[3/4] rounded-2xl flex items-center justify-center" style={{ background: tmpl?.bg || "linear-gradient(135deg,#374151,#1f2937)" }}>
            <ParrotLogo sz={80} color="rgba(0,0,0,0.3)" />
          </div>
        </div>
        <div className="w-80 space-y-5">
          <div>
            <h2 className="text-xl font-bold">{tmpl?.n || "Template"}</h2>
            <p className="text-sm text-gray-400 mt-1">{tmpl?.c || "Category"}</p>
          </div>
          {ModeSelector}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Angle</p>
            <div className="flex gap-2">
              {ANGLES.map(a => (
                <button key={a} className="flex-1 text-xs py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-300 transition-colors">{a}</button>
              ))}
            </div>
          </div>
          <CostLine cost={8} />
          <Btn primary className="w-full" onClick={() => go("generating")}><I n="sparkle" s={16} /> Generate with Template</Btn>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: prompt ─────────── */
  if (view === "prompt") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Create Custom Image</h1>
        {remixFrom && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: remixFrom.bg || "linear-gradient(135deg,#374151,#1f2937)" }}><ParrotLogo sz={20} color="rgba(0,0,0,0.4)" /></div>
            <div className="flex-1">
              <p className="text-xs text-amber-400 font-medium">Remixing from</p>
              <p className="text-sm text-white">{remixFrom.n || "Creation"}</p>
            </div>
            <button onClick={() => setRemixFrom(null)} className="text-gray-500 hover:text-white"><I n="x" s={16} /></button>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want to create..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white resize-none h-32 focus:outline-none focus:border-amber-500 placeholder-gray-600"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CHIPS.map(c => (
              <button key={c} onClick={() => setPrompt(p => p ? p + ", " + c.toLowerCase() : c)} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700">{c}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">Reference Image</p>
            <button onClick={() => setHasRef(!hasRef)} className={`w-9 h-5 rounded-full transition-colors ${hasRef ? "bg-amber-500" : "bg-gray-700"} relative`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${hasRef ? "left-[calc(100%-18px)]" : "left-0.5"}`} />
            </button>
          </div>
          {hasRef && (
            <div className="space-y-3">
              <div className="h-32 rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-600 cursor-pointer hover:border-gray-500 transition-colors">
                <I n="upload" s={28} />
                <span className="text-sm mt-1">Upload reference image</span>
              </div>
              {ModeSelector}
            </div>
          )}
        </div>
        <CostLine cost={hasRef ? 10 : 8} />
        <Btn primary className="w-full" onClick={() => go("generating")}><I n="sparkle" s={16} /> Generate Image</Btn>
      </div>
    </div>
  );

  /* ─────────── VIEW: generating ─────────── */
  if (view === "generating") return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
      {Nav}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <ParrotLogo sz={44} />
          </div>
        </div>
        <h2 className="text-xl font-bold mb-2">Creating Your Image...</h2>
        <p className="text-sm text-gray-400 mb-6">This usually takes 10-30 seconds</p>
        <div className="w-64">
          <ProgBar pct={prog} />
          <p className="text-xs text-gray-500 text-center">{Math.round(prog)}%</p>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: result ─────────── */
  if (view === "result") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <Placeholder label="Generated Image" gradient="from-amber-400/30 to-orange-500/30" icon="image" h="aspect-[3/4]" />
        </div>
        <div className="w-80 space-y-4">
          <Badge color="green">Complete</Badge>
          <h2 className="text-lg font-bold">Your Creation</h2>
          {prompt && <p className="text-sm text-gray-400 italic">"{prompt}"</p>}
          <div className="space-y-2">
            <Btn className="w-full"><I n="download" s={16} /> Download</Btn>
            <Btn className="w-full"><I n="edit" s={16} /> Edit</Btn>
            <Btn primary className="w-full" onClick={() => go("video")}><I n="video" s={16} /> Make Video</Btn>
            <Btn className="w-full" onClick={() => go("lipsync")}><I n="msg" s={16} /> Lip Sync</Btn>
            <Btn className="w-full" onClick={() => setShareModal({ n: prompt || "My Creation", bg: "linear-gradient(135deg,#f6d365,#fda085)", emoji: "🎨" })}><I n="ext" s={16} /> Share to Community</Btn>
          </div>
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Remix</p>
            <div className="flex gap-2">
              {TMPLS.slice(0, 3).map(t => (
                <button key={t.id} onClick={() => doRemix(t)} className="w-12 h-12 rounded-lg flex items-center justify-center border border-gray-700 hover:border-amber-500/50" style={{ background: t.bg }}><ParrotLogo sz={20} color="rgba(0,0,0,0.35)" /></button>
              ))}
            </div>
          </div>
          <Btn primary className="w-full" onClick={() => go("prompt")}><I n="plus" s={16} /> Create New</Btn>
        </div>
      </div>
      {ShareModalOverlay}
    </div>
  );

  /* ─────────── VIEW: video ─────────── */
  if (view === "video") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <Placeholder label="Source Image" gradient="from-purple-400/20 to-indigo-500/20" icon="image" h="aspect-[3/4]" />
        </div>
        <div className="w-80 space-y-5">
          <h2 className="text-xl font-bold">Create Video</h2>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Duration</p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(COSTS).map(([len, cost]) => (
                <button key={len} onClick={() => setVLen(len)} className={`text-center py-2 rounded-xl border transition-all ${vLen === len ? "border-purple-500 bg-purple-500/10" : "border-gray-700 hover:border-gray-600"}`}>
                  <p className="text-sm font-medium text-white">{len}</p>
                  <p className="text-[10px] text-gray-500">{cost} cr</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Motion Preset</p>
            <div className="grid grid-cols-3 gap-2">
              {MOTIONS.map(m => (
                <button key={m.id} onClick={() => setVMot(m.id)} className={`text-center py-2 rounded-xl border transition-all ${vMot === m.id ? "border-purple-500 bg-purple-500/10" : "border-gray-700 hover:border-gray-600"}`}>
                  <span className="text-lg block">{m.emoji}</span>
                  <span className="text-[10px] text-gray-400">{m.n}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Background Music</p>
            <div className="space-y-1.5">
              {[null, "upbeat", "chill", "dramatic"].map(a => (
                <button key={a ?? "none"} onClick={() => setVAud(a)} className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${vAud === a ? "border-purple-500 bg-purple-500/10 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>
                  {a ? a.charAt(0).toUpperCase() + a.slice(1) : "No Music"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs py-2 border-t border-gray-800">
            <span className="text-gray-400">Cost</span>
            <span className="text-purple-400 font-medium">{COSTS[vLen]} credits</span>
          </div>
          <Btn primary purple className="w-full" onClick={() => go("vgen")}><I n="video" s={16} /> Generate Video</Btn>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: vgen ─────────── */
  if (view === "vgen") return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
      {Nav}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full bg-purple-500/20 animate-pulse flex items-center justify-center text-purple-400">
            <I n="video" s={40} />
          </div>
          <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-purple-500/30 animate-ping" />
        </div>
        <h2 className="text-xl font-bold mb-2">Creating Your Video...</h2>
        <p className="text-sm text-gray-400 mb-6">Generating {vLen} video with {MOTIONS.find(m => m.id === vMot)?.n || "motion"}</p>
        <div className="w-64">
          <ProgBar pct={prog} color="from-purple-400 to-indigo-500" />
          <p className="text-xs text-gray-500 text-center">{Math.round(prog)}%</p>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: vresult ─────────── */
  if (view === "vresult") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <div className="aspect-video rounded-2xl bg-gradient-to-br from-purple-400/20 to-indigo-500/20 border border-gray-800 flex flex-col items-center justify-center relative">
            <button className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
              <I n="play" s={28} />
            </button>
            <div className="absolute bottom-0 inset-x-0 p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="w-1/3 h-full bg-purple-500 rounded-full" />
                </div>
                <span className="text-[10px] text-gray-400">0:02 / 0:{vLen.replace("s","").padStart(2,"0")}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="w-80 space-y-4">
          <Badge color="purple">Video Complete</Badge>
          <h2 className="text-lg font-bold">Your Video</h2>
          <p className="text-sm text-gray-400">{vLen} · {MOTIONS.find(m => m.id === vMot)?.n}{vAud ? ` · ${vAud}` : ""}</p>
          <div className="space-y-2">
            <Btn className="w-full"><I n="download" s={16} /> Download MP4</Btn>
            <Btn className="w-full" onClick={() => setShareModal({ n: "Video Creation", bg: "linear-gradient(135deg,#667eea,#764ba2)", emoji: "🎬" })}><I n="ext" s={16} /> Share</Btn>
          </div>
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-medium text-gray-400 mb-2">Remix</p>
            <div className="flex gap-2">
              {TMPLS.slice(0, 3).map(t => (
                <button key={t.id} onClick={() => doRemix(t)} className="w-12 h-12 rounded-lg flex items-center justify-center border border-gray-700 hover:border-purple-500/50" style={{ background: t.bg }}><ParrotLogo sz={20} color="rgba(0,0,0,0.35)" /></button>
              ))}
            </div>
          </div>
          <Btn primary className="w-full" onClick={() => go("studio")}><I n="plus" s={16} /> Create New</Btn>
        </div>
      </div>
      {ShareModalOverlay}
    </div>
  );

  /* ─────────── VIEW: lipsync ─────────── */
  if (view === "lipsync") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <Placeholder label="Selected Image" gradient="from-pink-400/20 to-rose-500/20" icon="image" h="aspect-[3/4]" />
        </div>
        <div className="w-80 space-y-5">
          <h2 className="text-xl font-bold">Lip Sync</h2>

          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Image Source</p>
            <div className="grid grid-cols-2 gap-2">
              {[["latest","Latest Gen"],["upload","Upload New"]].map(([k,l]) => (
                <button key={k} onClick={() => setLImg(k)} className={`py-2.5 rounded-xl border text-sm transition-all ${lImg === k ? "border-pink-500 bg-pink-500/10 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>{l}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Audio Source</p>
            <div className="grid grid-cols-2 gap-2">
              {[["upload","Upload Audio"],["ai","AI Voice"]].map(([k,l]) => (
                <button key={k} onClick={() => setLAud(k)} className={`py-2.5 rounded-xl border text-sm transition-all ${lAud === k ? "border-pink-500 bg-pink-500/10 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>{l}</button>
              ))}
            </div>
          </div>

          {lAud === "upload" && (
            <div className="h-20 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 cursor-pointer hover:border-gray-500 text-sm">
              <I n="upload" s={18} /><span className="ml-2">Upload audio file</span>
            </div>
          )}

          {lAud === "ai" && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Script</p>
                <textarea
                  value={lTxt}
                  onChange={e => setLTxt(e.target.value)}
                  placeholder="Type what the character should say..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white resize-none h-24 focus:outline-none focus:border-pink-500 placeholder-gray-600"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Voice Style</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {VOICES.map(v => (
                    <button key={v} onClick={() => setVStyle(v)} className={`text-xs py-1.5 rounded-lg border transition-colors ${vStyle === v ? "border-pink-500 bg-pink-500/10 text-pink-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs py-2 border-t border-gray-800">
            <span className="text-gray-400">Cost</span>
            <span className="text-pink-400 font-medium">15 credits</span>
          </div>
          <Btn primary className="w-full" onClick={() => go("lgen")}><I n="msg" s={16} /> Generate Lip Sync</Btn>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: lgen ─────────── */
  if (view === "lgen") return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
      {Nav}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full bg-pink-500/20 animate-pulse flex items-center justify-center text-pink-400">
            <I n="msg" s={40} />
          </div>
          <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-pink-500/30 animate-ping" />
        </div>
        <h2 className="text-xl font-bold mb-2">Creating Lip Sync...</h2>
        <p className="text-sm text-gray-400 mb-6">Syncing audio with your image</p>
        <div className="w-64">
          <ProgBar pct={prog} color="from-pink-400 to-rose-500" />
          <p className="text-xs text-gray-500 text-center">{Math.round(prog)}%</p>
        </div>
      </div>
    </div>
  );

  /* ─────────── VIEW: lresult ─────────── */
  if (view === "lresult") return (
    <div className="min-h-screen bg-gray-950 text-white">
      {Nav}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        <div className="flex-1">
          <div className="aspect-video rounded-2xl bg-gradient-to-br from-pink-400/20 to-rose-500/20 border border-gray-800 flex flex-col items-center justify-center relative">
            <button className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors">
              <I n="play" s={28} />
            </button>
            <div className="absolute bottom-0 inset-x-0 p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="w-2/5 h-full bg-pink-500 rounded-full" />
                </div>
                <span className="text-[10px] text-gray-400">0:03 / 0:08</span>
              </div>
            </div>
          </div>
        </div>
        <div className="w-80 space-y-4">
          <Badge color="purple">Lip Sync Complete</Badge>
          <h2 className="text-lg font-bold">Your Lip Sync</h2>
          {lAud === "ai" && lTxt && <p className="text-sm text-gray-400 italic">"{lTxt.slice(0, 80)}{lTxt.length > 80 ? "..." : ""}"</p>}
          <div className="space-y-2">
            <Btn className="w-full"><I n="download" s={16} /> Download</Btn>
            <Btn className="w-full" onClick={() => setShareModal({ n: "Lip Sync Creation", bg: "linear-gradient(135deg,#ec4899,#f43f5e)", emoji: "🗣️" })}><I n="ext" s={16} /> Share</Btn>
          </div>
          <Btn primary className="w-full" onClick={() => go("studio")}><I n="plus" s={16} /> Create New</Btn>
        </div>
      </div>
      {ShareModalOverlay}
    </div>
  );

  if (showUpgradeModal) return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowUpgradeModal(false)}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <ParrotLogo sz={36} />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Upgrade to Create More</h3>
        <p className="text-sm text-gray-400 mb-6">Your current plan allows 1 character. Upgrade to Pro or Enterprise to create unlimited characters.</p>
        <Btn primary className="w-full mb-2">Upgrade Plan</Btn>
        <button onClick={() => setShowUpgradeModal(false)} className="text-sm text-gray-500 hover:text-gray-300">Maybe Later</button>
      </div>
    </div>
  );

  return null;
}
