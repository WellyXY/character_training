const AMBER = "#F59E0B";

// ── COMPONENTS ──

export const Btn = ({ children, primary, danger, sm, purple, className = "", ...props }) => (
  <button
    className={`font-semibold rounded-xl flex items-center justify-center gap-2 transition-all
      ${danger ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
      : primary
        ? (purple
          ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20"
          : "bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/20")
        : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"}
      ${sm ? "px-4 py-2 text-sm" : "px-6 py-3 text-sm"} ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const Badge = ({ children, color = "gray" }) => {
  const colors = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    gray: "bg-gray-700 text-gray-300 border-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[color]}`}>
      {children}
    </span>
  );
};

export const Stat = ({ label, value, sub, trend }) => (
  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
    <p className="text-xs text-gray-500 mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
    <div className="flex items-center gap-1 mt-1">
      {trend !== undefined && (
        <span className={`text-xs ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
          {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </span>
      )}
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  </div>
);

export const ProgBar = ({ pct, color = "from-amber-400 to-orange-500" }) => (
  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
    <div
      className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`}
      style={{ width: `${pct}%` }}
    />
  </div>
);

export const Dots = ({ c, t }) => (
  <div className="flex gap-2 justify-center mt-6">
    {Array.from({ length: t }).map((_, i) => (
      <div
        key={i}
        className={`h-1.5 rounded-full transition-all ${
          i === c ? "w-8 bg-amber-500" : "w-1.5 bg-gray-700"
        }`}
      />
    ))}
  </div>
);

// ── SVG ICON COMPONENT ──

export const I = ({ n, s = 18 }) => {
  const paths = {
    chevL: <polyline points="15 18 9 12 15 6" />,
    chevR: <polyline points="9 18 15 12 9 6" />,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    check: <polyline points="20 6 9 17 4 12" />,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
    play: <polygon points="5 3 19 12 5 21 5 3" />,
    sparkle: <><circle cx="12" cy="12" r="4" fill={AMBER} opacity="0.3" /><path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36 6.36l-1.41-1.41M7.05 7.05L5.64 5.64m12.73 0l-1.42 1.41M7.05 16.95l-1.41 1.41" /></>,
    refresh: <><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    credit: <><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
    chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>,
    arrowR: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    wand: <path d="M15 4V2m0 14v-2M8 9h2m10 0h2m-4.2 2.8L19 13m-4-4h0m2.8-2.8L19 5M12.2 6.2L11 5M3 21l9-9" />,
    msg: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
    ext: <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  };

  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[n]}
    </svg>
  );
};

export const ParrotLogo = ({ sz = 28, color = AMBER }) => (
  <svg width={sz} height={sz} viewBox="420 680 520 770" preserveAspectRatio="xMidYMid meet" fill="none">
    <g transform="translate(0,2160) scale(0.1,-0.1)" fill={color} stroke="none">
      <path d="M7082 13705 c-450 -79 -738 -403 -1019 -1145 -51 -137 -87 -250 -80 -257 2 -1 44 15 93 37 367 161 675 124 931 -114 119 -111 200 -248 244 -411 33 -124 38 -366 9 -505 -77 -380 -252 -671 -575 -957 -227 -200 -373 -299 -650 -436 -88 -44 -172 -88 -187 -98 -33 -24 -42 -49 -118 -329 -100 -365 -214 -759 -289 -1000 -76 -239 -82 -275 -52 -285 52 -16 304 33 435 84 254 102 429 228 548 396 146 207 182 363 194 840 11 461 29 506 274 658 126 79 303 209 363 266 70 67 241 271 300 359 165 246 248 540 248 886 1 208 -23 353 -92 562 l-29 90 -133 12 c-213 18 -317 56 -442 159 -222 183 -267 530 -97 756 59 78 148 138 255 173 194 63 435 16 560 -108 26 -26 47 -53 47 -60 0 -8 -18 -38 -41 -68 -91 -122 -129 -232 -136 -398 -6 -134 8 -197 50 -227 36 -25 181 -20 274 10 93 30 94 29 119 -81 9 -41 21 -77 27 -81 17 -10 84 73 126 157 87 175 77 349 -32 531 -52 87 -132 169 -202 205 -43 23 -57 37 -79 81 -64 131 -215 235 -411 284 -107 27 -319 34 -433 14z"/>
      <path d="M7280 13272 c-99 -49 -85 -202 21 -234 114 -34 211 88 149 189 -36 60 -104 78 -170 45z"/>
      <path d="M6345 12236 c-94 -22 -166 -52 -241 -102 -140 -93 -280 -256 -363 -422 -47 -94 -139 -372 -262 -797 -101 -346 -198 -673 -294 -989 -19 -66 -33 -126 -31 -133 8 -19 115 -16 217 6 230 51 627 246 898 440 330 237 557 493 706 796 55 112 81 192 101 314 33 190 0 440 -78 597 -90 180 -272 291 -493 300 -64 2 -122 -1 -160 -10z"/>
    </g>
  </svg>
);

// ── DATA ──

export const TMPLS = [
  { id: 1, n: "Golden Hour Portrait", c: "Fashion", bg: "linear-gradient(135deg,#f6d365,#fda085)", emoji: "🌅" },
  { id: 2, n: "City Night", c: "Street", bg: "linear-gradient(135deg,#667eea,#764ba2)", emoji: "🌃" },
  { id: 3, n: "Beach Sunset", c: "Lifestyle", bg: "linear-gradient(135deg,#ff9a9e,#fecfef)", emoji: "🏖️" },
  { id: 4, n: "Street Fashion", c: "Fashion", bg: "linear-gradient(135deg,#fa709a,#fee140)", emoji: "👗" },
  { id: 5, n: "Coffee Shop", c: "Lifestyle", bg: "linear-gradient(135deg,#a18cd1,#fbc2eb)", emoji: "☕" },
  { id: 6, n: "Studio Minimal", c: "Portrait", bg: "linear-gradient(135deg,#43e97b,#38f9d7)", emoji: "📸" },
];

export const MODES = [
  { id: "face", i: "👤", n: "Face Only", d: "Keep everything, swap face" },
  { id: "pose_bg", i: "📐", n: "Pose & BG", d: "Match composition & setting", rec: true },
  { id: "clothing", i: "👗", n: "Clothing", d: "Match outfit & pose" },
];

export const ANGLES = ["Front View", "3/4 Angle", "Side Profile"];

export const COSTS = { "5s": 10, "10s": 20, "15s": 35, "30s": 60 };

export const USERS_DATA = [
  { id: 1, name: "Sarah Chen", email: "sarah@email.com", type: "Pro", credits: 5059, chars: 3, gens: 142, status: "active", joined: "Jan 12, 2026", last: "2h ago" },
  { id: 2, name: "Alex Rivera", email: "alex@studio.com", type: "Business", credits: 12400, chars: 8, gens: 890, status: "active", joined: "Nov 3, 2025", last: "30m ago", seats: 5 },
  { id: 3, name: "Jamie Park", email: "jamie@email.com", type: "Pro", credits: 230, chars: 1, gens: 45, status: "active", joined: "Feb 1, 2026", last: "1d ago" },
  { id: 4, name: "Morgan Lee", email: "morgan@brand.co", type: "Business", credits: 8200, chars: 12, gens: 1230, status: "active", joined: "Sep 15, 2025", last: "5m ago", seats: 10 },
  { id: 5, name: "Taylor Kim", email: "taylor@fake.com", type: "Free", credits: 0, chars: 1, gens: 3, status: "suspended", joined: "Feb 10, 2026", last: "3d ago" },
];

export const QUEUE_INIT = [
  { id: 1, user: "Sarah Chen", type: "Image", tags: "INS Post", submitted: "2 hours ago", bg: "linear-gradient(135deg,#f6d365,#fda085)" },
  { id: 2, user: "Alex Rivera", type: "Image", tags: "Fashion", submitted: "5 hours ago", bg: "linear-gradient(135deg,#667eea,#764ba2)" },
  { id: 3, user: "Jamie Park", type: "Video", tags: "Lifestyle", submitted: "1 day ago", bg: "linear-gradient(135deg,#a18cd1,#fbc2eb)" },
];

export const APPROVED_ITEMS = [
  { id: 10, user: "Morgan Lee", type: "Image", tags: "Boudoir", approved: "1 day ago", approvedBy: "Alex M.", bg: "linear-gradient(135deg,#fa709a,#fee140)" },
  { id: 11, user: "Sarah Chen", type: "Image", tags: "Portrait", approved: "2 days ago", approvedBy: "Alex M.", bg: "linear-gradient(135deg,#43e97b,#38f9d7)" },
  { id: 12, user: "Alex Rivera", type: "Video", tags: "Fashion", approved: "3 days ago", approvedBy: "Priya K.", bg: "linear-gradient(135deg,#667eea,#764ba2)" },
];

export const REJECTED_ITEMS = [
  { id: 20, user: "Taylor Kim", type: "Image", tags: "Explicit", rejected: "1 day ago", rejectedBy: "Alex M.", reason: "Violates content policy", bg: "linear-gradient(135deg,#2d2d2d,#4a4a4a)" },
  { id: 21, user: "Jordan Wells", type: "Image", tags: "Copyright", rejected: "4 days ago", rejectedBy: "Priya K.", reason: "Contains copyrighted brand logos", bg: "linear-gradient(135deg,#434343,#000000)" },
];

export const FLAGGED_ITEMS = [
  { id: 30, user: "Taylor Kim", type: "Image", tags: "Review", flagged: "6 hours ago", flaggedBy: "Auto-filter", reason: "Content filter triggered", bg: "linear-gradient(135deg,#ff6b6b,#ee5a24)" },
  { id: 31, user: "Casey Doe", type: "Video", tags: "Review", flagged: "1 day ago", flaggedBy: "Morgan Lee (report)", reason: "User report — inappropriate content", bg: "linear-gradient(135deg,#6c5ce7,#a29bfe)" },
];

export const AUDIT_LOG = [
  { id: 1, admin: "Alex Morgan", action: "Approved submission", target: "Sarah Chen — Golden Hour image", time: "2h ago" },
  { id: 2, admin: "Alex Morgan", action: "Spoofed user", target: "Jamie Park", time: "3h ago" },
  { id: 3, admin: "Priya Kumar", action: "Adjusted credits", target: "Morgan Lee — +500 credits", time: "5h ago" },
  { id: 4, admin: "Alex Morgan", action: "Suspended user", target: "Taylor Kim — policy violation", time: "1d ago" },
  { id: 5, admin: "Priya Kumar", action: "Rejected submission", target: "Jordan Wells — copyright issue", time: "4d ago" },
];
