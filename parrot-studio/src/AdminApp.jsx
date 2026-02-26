import { useState } from "react";
import {
  Btn, Badge, Stat, I, ParrotLogo, ProgBar,
  USERS_DATA, QUEUE_INIT, APPROVED_ITEMS, REJECTED_ITEMS, FLAGGED_ITEMS, AUDIT_LOG,
} from "./shared";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  {
    id: "users", label: "Users", icon: "users",
    subs: [
      { id: "all", label: "All Users" },
      { id: "business", label: "Business Accounts" },
      { id: "flagged", label: "Flagged / Suspended" },
    ],
  },
  {
    id: "gallery", label: "Gallery", icon: "image",
    subs: [
      { id: "public", label: "Public Gallery" },
      { id: "moderation", label: "Moderation Queue" },
      { id: "import", label: "Import Tools" },
    ],
  },
  {
    id: "credits", label: "Credits & Billing", icon: "credit",
    subs: [
      { id: "transactions", label: "Transactions" },
      { id: "subscriptions", label: "Subscriptions" },
      { id: "pricing", label: "Pricing Config" },
    ],
  },
  {
    id: "analytics", label: "Analytics", icon: "chart",
    subs: [
      { id: "funnel", label: "User Funnel" },
      { id: "genstats", label: "Generation Stats" },
      { id: "revenue", label: "Revenue" },
      { id: "trends", label: "Content Trends" },
    ],
  },
  { id: "moderation", label: "Moderation", icon: "shield" },
  {
    id: "settings", label: "Settings", icon: "settings",
    subs: [
      { id: "generation", label: "Generation Config" },
      { id: "features", label: "Feature Flags" },
      { id: "notifications", label: "Notifications" },
      { id: "system", label: "System" },
    ],
  },
];

const MOCK_CHARS = [
  { id: 1, name: "Summer Look", bg: "linear-gradient(135deg,#f6d365,#fda085)" },
  { id: 2, name: "Night Vibe", bg: "linear-gradient(135deg,#667eea,#764ba2)" },
  { id: 3, name: "Beach Day", bg: "linear-gradient(135deg,#ff9a9e,#fecfef)" },
];

const MOCK_GALLERY = [
  { id: 1, label: "Golden Hour", cat: "Fashion", bg: "linear-gradient(135deg,#f6d365,#fda085)", featured: true },
  { id: 2, label: "City Night", cat: "Street", bg: "linear-gradient(135deg,#667eea,#764ba2)", featured: false },
  { id: 3, label: "Beach Sunset", cat: "Lifestyle", bg: "linear-gradient(135deg,#ff9a9e,#fecfef)", featured: true },
  { id: 4, label: "Street Fashion", cat: "Fashion", bg: "linear-gradient(135deg,#fa709a,#fee140)", featured: false },
  { id: 5, label: "Coffee Shop", cat: "Lifestyle", bg: "linear-gradient(135deg,#a18cd1,#fbc2eb)", featured: false },
  { id: 6, label: "Studio Minimal", cat: "Portrait", bg: "linear-gradient(135deg,#43e97b,#38f9d7)", featured: true },
];

const Toggle = ({ on, onToggle }) => (
  <button
    onClick={onToggle}
    className={`relative w-10 h-5 rounded-full transition-colors ${on ? "bg-purple-500" : "bg-gray-700"}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`}
    />
  </button>
);

export default function AdminApp({ onCreator, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [subPage, setSubPage] = useState(null);
  const [spoofing, setSpoofing] = useState(false);
  const [selUser, setSelUser] = useState(null);
  const [modTab, setModTab] = useState("pending");
  const [queue, setQueue] = useState(QUEUE_INIT);
  const [showDrop, setShowDrop] = useState(false);
  const [userFilter, setUserFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [credTab, setCredTab] = useState("transactions");
  const [analyticsTab, setAnalyticsTab] = useState("funnel");
  const [settingsTab, setSettingsTab] = useState("generation");
  const [expandedNav, setExpandedNav] = useState(null);

  const nav = (p, s = null) => { setPage(p); setSubPage(s); setSelUser(null); };
  const isActive = (id, sub) => page === id && subPage === sub;

  const breadcrumb = () => {
    const item = NAV.find((n) => n.id === page);
    if (!item) return page;
    if (subPage && item.subs) {
      const sub = item.subs.find((s) => s.id === subPage);
      return `${item.label} / ${sub ? sub.label : subPage}`;
    }
    return item.label;
  };

  // ── SPOOF MODE ──
  if (spoofing && selUser) {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <I n="eye" s={16} />
            <span className="text-amber-300 font-medium">Viewing as:</span>
            <span className="text-white font-semibold">{selUser.name}</span>
            <span className="text-amber-400/70">({selUser.email})</span>
            <span className="text-amber-400/50">—</span>
            <Badge color={selUser.type === "Business" ? "blue" : selUser.type === "Pro" ? "purple" : "gray"}>
              {selUser.type} account
            </Badge>
          </div>
          <Btn sm danger onClick={() => setSpoofing(false)}>
            <I n="x" s={14} /> Exit Spoof
          </Btn>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-3">
            <div className="flex items-center gap-2 mb-4 px-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black font-bold text-sm">
                {selUser.name[0]}
              </div>
              <div>
                <p className="text-sm font-semibold">{selUser.name}</p>
                <p className="text-xs text-gray-500">{selUser.type}</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 mb-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Credit Balance</p>
              <p className="text-xl font-bold text-amber-400">{selUser.credits.toLocaleString()}</p>
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-2">Characters ({selUser.chars})</p>
            <div className="space-y-1 flex-1 overflow-y-auto">
              {MOCK_CHARS.slice(0, selUser.chars).map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer">
                  <div className="w-7 h-7 rounded-lg" style={{ background: c.bg }} />
                  <span className="text-sm text-gray-300">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">{selUser.name}'s Gallery</h2>
            <div className="grid grid-cols-4 gap-3 mb-8">
              {Array.from({ length: Math.min(selUser.gens, 8) }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl" style={{ background: MOCK_GALLERY[i % MOCK_GALLERY.length].bg }} />
              ))}
            </div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Private Inspiration Uploads</h3>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-square rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600">
                  <I n="image" s={20} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PAGE CONTENT RENDERERS ──

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Total Users" value="2,847" sub="this month" trend={12} />
        <Stat label="Generations Today" value="1,203" sub="vs 980 yesterday" trend={23} />
        <Stat label="Revenue (MTD)" value="$34,200" sub="target: $40k" trend={8} />
        <Stat label="Pending Moderation" value={queue.length} sub="items in queue" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">DAU</p>
          <p className="text-2xl font-bold">412</p>
          <span className="text-xs text-green-400">↑ 5%</span>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">WAU</p>
          <p className="text-2xl font-bold">1,834</p>
          <span className="text-xs text-green-400">↑ 11%</span>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">MAU</p>
          <p className="text-2xl font-bold">2,847</p>
          <span className="text-xs text-green-400">↑ 12%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">User Growth (past 7 days)</h3>
          <div className="flex items-end gap-2 h-32">
            {[45, 62, 38, 71, 55, 89, 67].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-gradient-to-t from-purple-500 to-indigo-400 rounded-t" style={{ height: `${v}%` }} />
                <span className="text-[10px] text-gray-500">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Revenue Trend</h3>
          <div className="flex items-end gap-2 h-32">
            {[5200, 6100, 4800, 7300, 6900, 8200, 7400].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t" style={{ height: `${(v / 8200) * 100}%` }} />
                <span className="text-[10px] text-gray-500">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Generations by Type</h3>
          {[
            { label: "Image — Portrait", pct: 42, color: "from-amber-400 to-orange-500" },
            { label: "Image — Fashion", pct: 28, color: "from-purple-400 to-indigo-500" },
            { label: "Video — Short", pct: 18, color: "from-blue-400 to-cyan-500" },
            { label: "Video — Long", pct: 12, color: "from-green-400 to-emerald-500" },
          ].map((r) => (
            <div key={r.label} className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{r.label}</span>
                <span className="text-gray-500">{r.pct}%</span>
              </div>
              <ProgBar pct={r.pct} color={r.color} />
            </div>
          ))}
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Credit Consumption</h3>
          {[
            { label: "Image generation", pct: 55, color: "from-amber-400 to-orange-500" },
            { label: "Video generation", pct: 30, color: "from-purple-400 to-indigo-500" },
            { label: "Character creation", pct: 10, color: "from-blue-400 to-cyan-500" },
            { label: "Premium features", pct: 5, color: "from-green-400 to-emerald-500" },
          ].map((r) => (
            <div key={r.label} className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{r.label}</span>
                <span className="text-gray-500">{r.pct}%</span>
              </div>
              <ProgBar pct={r.pct} color={r.color} />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Account Tier Breakdown</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Free", count: 1842, pct: 65, color: "gray" },
            { label: "Pro", count: 738, pct: 26, color: "purple" },
            { label: "Business", count: 267, pct: 9, color: "blue" },
          ].map((t) => (
            <div key={t.label} className="text-center">
              <Badge color={t.color}>{t.label}</Badge>
              <p className="text-2xl font-bold mt-2">{t.count.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{t.pct}% of total</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Admin Activity</h3>
        <div className="space-y-2">
          {AUDIT_LOG.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-700/50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold">
                  {e.admin[0]}
                </div>
                <div>
                  <span className="text-gray-300 font-medium">{e.admin}</span>{" "}
                  <span className="text-gray-500">{e.action}</span>{" "}
                  <span className="text-gray-400">{e.target}</span>
                </div>
              </div>
              <span className="text-xs text-gray-600">{e.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderUserDetail = () => {
    const u = selUser;
    return (
      <div className="space-y-6">
        <button onClick={() => setSelUser(null)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <I n="chevL" s={14} /> Back to Users
        </button>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xl">
              {u.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{u.name}</h2>
                <Badge color={u.type === "Business" ? "blue" : u.type === "Pro" ? "purple" : "gray"}>{u.type}</Badge>
                <Badge color={u.status === "active" ? "green" : "red"}>{u.status}</Badge>
              </div>
              <p className="text-sm text-gray-400">{u.email} · Joined {u.joined}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn sm onClick={() => { setSpoofing(true); }}>
              <I n="eye" s={14} /> Spoof
            </Btn>
            <Btn sm><I n="edit" s={14} /> Edit</Btn>
            <Btn sm><I n="bell" s={14} /> Notify</Btn>
            <Btn sm danger><I n="shield" s={14} /> Suspend</Btn>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Credits" value={u.credits.toLocaleString()} sub="balance" />
          <Stat label="Characters" value={u.chars} />
          <Stat label="Generations" value={u.gens} trend={14} />
          <Stat label="Last Active" value={u.last} />
        </div>
        {u.type === "Business" && (
          <div className="bg-blue-500/10 rounded-xl p-5 border border-blue-500/20">
            <h3 className="text-sm font-semibold text-blue-300 mb-3">Business Team</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center"><p className="text-2xl font-bold">{u.seats || 5}</p><p className="text-xs text-gray-400">Seats</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{Math.floor((u.seats || 5) * 0.8)}</p><p className="text-xs text-gray-400">Active Members</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{u.credits.toLocaleString()}</p><p className="text-xs text-gray-400">Shared Credits</p></div>
            </div>
          </div>
        )}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Btn sm><I n="credit" s={14} /> Add Credits</Btn>
            <Btn sm><I n="refresh" s={14} /> Reset Password</Btn>
            <Btn sm><I n="msg" s={14} /> Send Message</Btn>
            <Btn sm><I n="download" s={14} /> Export Data</Btn>
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Activity</h3>
          {[
            { act: "Generated image", detail: "Portrait — Golden Hour", time: "2h ago" },
            { act: "Purchased credits", detail: "+500 credits ($4.99)", time: "1d ago" },
            { act: "Created character", detail: "Summer Look", time: "3d ago" },
          ].map((a, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 text-sm">
              <div><span className="text-gray-300">{a.act}</span> <span className="text-gray-500">— {a.detail}</span></div>
              <span className="text-xs text-gray-600">{a.time}</span>
            </div>
          ))}
        </div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Credit Transaction History</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b border-gray-700">
              <th className="pb-2">Date</th><th className="pb-2">Type</th><th className="pb-2">Amount</th><th className="pb-2">Balance</th>
            </tr></thead>
            <tbody>
              {[
                { date: "Feb 18", type: "Generation", amt: -10, bal: u.credits },
                { date: "Feb 17", type: "Purchase", amt: 500, bal: u.credits + 10 },
                { date: "Feb 15", type: "Generation", amt: -20, bal: u.credits - 490 },
                { date: "Feb 14", type: "Bonus", amt: 100, bal: u.credits - 470 },
              ].map((t, i) => (
                <tr key={i} className="border-b border-gray-700/50 last:border-0">
                  <td className="py-2 text-gray-400">{t.date}</td>
                  <td className="py-2 text-gray-300">{t.type}</td>
                  <td className={`py-2 font-medium ${t.amt > 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.amt > 0 ? "+" : ""}{t.amt}
                  </td>
                  <td className="py-2 text-gray-400">{t.bal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderUsers = () => {
    if (selUser) return renderUserDetail();
    const filtered = USERS_DATA.filter((u) => {
      if (subPage === "business" && u.type !== "Business") return false;
      if (subPage === "flagged" && u.status !== "suspended") return false;
      if (userFilter !== "all" && u.type.toLowerCase() !== userFilter) return false;
      if (searchQ && !u.name.toLowerCase().includes(searchQ.toLowerCase()) && !u.email.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
    return (
      <div className="space-y-4">
        {subPage === "business" && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-300 flex items-center gap-2">
            <I n="shield" s={16} /> Showing business accounts only — {filtered.length} accounts
          </div>
        )}
        {subPage === "flagged" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex items-center gap-2">
            <I n="flag" s={16} /> Showing flagged & suspended users — {filtered.length} accounts
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <I n="search" s={16} />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
              style={{ paddingLeft: "2.25rem" }}
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><I n="search" s={16} /></div>
          </div>
          <div className="flex gap-1">
            {["all", "pro", "business", "free"].map((f) => (
              <button
                key={f}
                onClick={() => setUserFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${userFilter === f ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <Btn sm><I n="download" s={14} /> Export</Btn>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Chars</th>
                <th className="px-4 py-3">Gens</th>
                <th className="px-4 py-3">Last Active</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                        {u.name[0]}
                      </div>
                      <div>
                        <p className="text-gray-200 font-medium">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={u.type === "Business" ? "blue" : u.type === "Pro" ? "purple" : "gray"}>{u.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u.credits.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-300">{u.chars}</td>
                  <td className="px-4 py-3 text-gray-300">{u.gens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.last}</td>
                  <td className="px-4 py-3">
                    <Badge color={u.status === "active" ? "green" : "red"}>{u.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setSelUser(u)} className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded bg-purple-500/10">View</button>
                      <button onClick={() => { setSelUser(u); setSpoofing(true); }} className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded bg-amber-500/10">Spoof</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filtered.length} of {USERS_DATA.length} users</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:text-white">← Prev</button>
            <button className="px-3 py-1 rounded bg-purple-500/20 text-purple-300">1</button>
            <button className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:text-white">2</button>
            <button className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:text-white">Next →</button>
          </div>
        </div>
      </div>
    );
  };

  const renderGalleryPublic = () => {
    const [galTab, setGalTab] = [modTab, setModTab];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {["All", "Admin", "User", "Featured"].map((t) => (
              <button
                key={t}
                onClick={() => setModTab(t.toLowerCase())}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${galTab === t.toLowerCase() ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn sm><I n="upload" s={14} /> Upload</Btn>
            <Btn sm><I n="download" s={14} /> Import</Btn>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {MOCK_GALLERY.filter((g) => galTab === "all" || (galTab === "featured" && g.featured)).map((g) => (
            <div key={g.id} className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer" style={{ background: g.bg }}>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex gap-2">
                  <button className="p-2 bg-gray-900/80 rounded-lg text-gray-300 hover:text-white"><I n="flag" s={14} /></button>
                  <button className="p-2 bg-gray-900/80 rounded-lg text-gray-300 hover:text-white"><I n="eye" s={14} /></button>
                  <button className="p-2 bg-gray-900/80 rounded-lg text-gray-300 hover:text-white"><I n="sparkle" s={14} /></button>
                  <button className="p-2 bg-gray-900/80 rounded-lg text-gray-300 hover:text-white"><I n="trash" s={14} /></button>
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                <p className="text-xs font-medium text-white">{g.label}</p>
                <p className="text-[10px] text-gray-300">{g.cat}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGalleryModeration = () => {
    const tabs = [
      { id: "pending", label: "Pending", count: queue.length },
      { id: "approved", label: "Approved", count: APPROVED_ITEMS.length },
      { id: "rejected", label: "Rejected", count: REJECTED_ITEMS.length },
      { id: "flagged", label: "Flagged", count: FLAGGED_ITEMS.length },
    ];
    const items = modTab === "pending" ? queue : modTab === "approved" ? APPROVED_ITEMS : modTab === "rejected" ? REJECTED_ITEMS : FLAGGED_ITEMS;
    return (
      <div className="space-y-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setModTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${modTab === t.id ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${modTab === t.id ? "bg-purple-500/30" : "bg-gray-700"}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="aspect-video" style={{ background: item.bg }} />
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{item.user}</p>
                    <p className="text-xs text-gray-500">{item.type} · {item.tags}</p>
                  </div>
                  <Badge color={item.type === "Video" ? "blue" : "purple"}>{item.type}</Badge>
                </div>
                {item.submitted && <p className="text-xs text-gray-500">Submitted {item.submitted}</p>}
                {item.approved && <p className="text-xs text-green-400">Approved {item.approved} by {item.approvedBy}</p>}
                {item.rejected && (
                  <div><p className="text-xs text-red-400">Rejected {item.rejected} by {item.rejectedBy}</p><p className="text-xs text-gray-500">{item.reason}</p></div>
                )}
                {item.flagged && (
                  <div><p className="text-xs text-amber-400">Flagged {item.flagged} by {item.flaggedBy}</p><p className="text-xs text-gray-500">{item.reason}</p></div>
                )}
                <div className="flex gap-1 pt-1">
                  {modTab === "pending" && (
                    <>
                      <Btn sm className="flex-1" onClick={() => setQueue((q) => q.filter((x) => x.id !== item.id))}>
                        <I n="check" s={14} /> Approve
                      </Btn>
                      <Btn sm danger className="flex-1" onClick={() => setQueue((q) => q.filter((x) => x.id !== item.id))}>
                        <I n="x" s={14} /> Reject
                      </Btn>
                    </>
                  )}
                  {modTab === "approved" && <Btn sm danger className="flex-1"><I n="x" s={14} /> Revoke</Btn>}
                  {modTab === "rejected" && <Btn sm className="flex-1"><I n="refresh" s={14} /> Reconsider</Btn>}
                  {modTab === "flagged" && (
                    <>
                      <Btn sm className="flex-1"><I n="check" s={14} /> Clear</Btn>
                      <Btn sm danger className="flex-1"><I n="trash" s={14} /> Remove</Btn>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGalleryImport = () => (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-8 border-2 border-dashed border-gray-600 text-center">
        <I n="upload" s={40} />
        <p className="text-gray-300 mt-3 font-medium">Bulk Upload Images</p>
        <p className="text-sm text-gray-500 mt-1">Drag & drop files or click to browse. Supports JPG, PNG, WebP.</p>
        <Btn sm className="mt-4 mx-auto" primary purple><I n="upload" s={14} /> Choose Files</Btn>
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">URL Import</h3>
        <div className="flex gap-2">
          <input placeholder="https://example.com/image.jpg" className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
          <Btn sm><I n="download" s={14} /> Fetch</Btn>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">CSV Import</h3>
        <p className="text-xs text-gray-500 mb-3">Upload a CSV with columns: url, title, category, tags</p>
        <div className="flex gap-2">
          <Btn sm><I n="upload" s={14} /> Upload CSV</Btn>
          <Btn sm><I n="download" s={14} /> Download Template</Btn>
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Batch Tagging</h3>
        <p className="text-xs text-gray-500 mb-3">Apply tags to all items in the current import batch.</p>
        <div className="flex gap-2 flex-wrap">
          {["Fashion", "Portrait", "Lifestyle", "Street", "Studio"].map((t) => (
            <button key={t} className="px-3 py-1 rounded-full text-xs bg-gray-700 text-gray-300 hover:bg-purple-500/20 hover:text-purple-300 transition-colors">{t}</button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderGallery = () => {
    if (subPage === "moderation") return renderGalleryModeration();
    if (subPage === "import") return renderGalleryImport();
    return renderGalleryPublic();
  };

  const renderCredits = () => {
    const tabs = [
      { id: "transactions", label: "Transactions" },
      { id: "subscriptions", label: "Subscriptions" },
      { id: "pricing", label: "Pricing Config" },
    ];
    return (
      <div className="space-y-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setCredTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${credTab === t.id ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {credTab === "transactions" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Stat label="Total Revenue" value="$34,200" trend={8} sub="this month" />
              <Stat label="Credits Sold" value="128,400" trend={15} />
              <Stat label="Avg Transaction" value="$12.40" trend={-3} />
              <Stat label="Refunds" value="$420" sub="1.2% rate" />
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="px-4 py-3">User</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Credits</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th>
                </tr></thead>
                <tbody>
                  {[
                    { user: "Sarah Chen", type: "Purchase", amt: "$9.99", cred: "+1,000", date: "Feb 18", status: "completed" },
                    { user: "Alex Rivera", type: "Subscription", amt: "$29.99", cred: "+3,000", date: "Feb 17", status: "completed" },
                    { user: "Morgan Lee", type: "Purchase", amt: "$49.99", cred: "+6,000", date: "Feb 16", status: "completed" },
                    { user: "Jamie Park", type: "Refund", amt: "-$4.99", cred: "-500", date: "Feb 15", status: "refunded" },
                  ].map((t, i) => (
                    <tr key={i} className="border-b border-gray-700/50 last:border-0">
                      <td className="px-4 py-3 text-gray-300">{t.user}</td>
                      <td className="px-4 py-3"><Badge color={t.type === "Refund" ? "red" : t.type === "Subscription" ? "purple" : "green"}>{t.type}</Badge></td>
                      <td className={`px-4 py-3 font-medium ${t.amt.startsWith("-") ? "text-red-400" : "text-green-400"}`}>{t.amt}</td>
                      <td className="px-4 py-3 text-gray-400">{t.cred}</td>
                      <td className="px-4 py-3 text-gray-500">{t.date}</td>
                      <td className="px-4 py-3"><Badge color={t.status === "completed" ? "green" : "red"}>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {credTab === "subscriptions" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Stat label="MRR" value="$12,400" trend={11} />
              <Stat label="Churn Rate" value="3.2%" trend={-0.5} />
              <Stat label="LTV" value="$142" trend={6} />
              <Stat label="Active Subs" value="438" trend={9} />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Plan Breakdown</h3>
              {[
                { plan: "Pro Monthly ($9.99)", count: 312, pct: 71 },
                { plan: "Pro Annual ($89.99)", count: 84, pct: 19 },
                { plan: "Business ($29.99)", count: 42, pct: 10 },
              ].map((p) => (
                <div key={p.plan} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{p.plan}</span>
                    <span className="text-gray-500">{p.count} users ({p.pct}%)</span>
                  </div>
                  <ProgBar pct={p.pct} color="from-purple-400 to-indigo-500" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Promo Codes</h3>
                {[
                  { code: "LAUNCH50", discount: "50% off", uses: "142/500", active: true },
                  { code: "WELCOME20", discount: "20% off", uses: "89/∞", active: true },
                  { code: "HOLIDAY30", discount: "30% off", uses: "500/500", active: false },
                ].map((p) => (
                  <div key={p.code} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 text-sm">
                    <div>
                      <code className="text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded text-xs">{p.code}</code>
                      <span className="text-gray-500 ml-2">{p.discount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{p.uses}</span>
                      <Badge color={p.active ? "green" : "gray"}>{p.active ? "Active" : "Expired"}</Badge>
                    </div>
                  </div>
                ))}
                <Btn sm className="mt-3"><I n="plus" s={14} /> Create Code</Btn>
              </div>
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Bulk Credit Operations</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Target</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500">
                      <option>All Pro users</option><option>All Business users</option><option>All Free users</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Credits</label>
                    <input type="number" placeholder="100" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500" />
                  </div>
                  <Btn sm primary purple><I n="credit" s={14} /> Grant Credits</Btn>
                </div>
              </div>
            </div>
          </div>
        )}
        {credTab === "pricing" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Generation Costs</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="pb-2">Type</th><th className="pb-2">Credits</th><th className="pb-2">Est. Cost</th><th className="pb-2">Margin</th>
                </tr></thead>
                <tbody>
                  {[
                    { type: "Image — Standard", cred: 10, cost: "$0.03", margin: "67%" },
                    { type: "Image — HD", cred: 20, cost: "$0.06", margin: "70%" },
                    { type: "Video — 5s", cred: 30, cost: "$0.12", margin: "60%" },
                    { type: "Video — 15s", cred: 60, cost: "$0.25", margin: "58%" },
                    { type: "Character Create", cred: 50, cost: "$0.15", margin: "70%" },
                  ].map((r, i) => (
                    <tr key={i} className="border-b border-gray-700/50 last:border-0">
                      <td className="py-2 text-gray-300">{r.type}</td>
                      <td className="py-2 text-amber-400">{r.cred}</td>
                      <td className="py-2 text-gray-400">{r.cost}</td>
                      <td className="py-2 text-green-400">{r.margin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Subscription Tiers</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { tier: "Free", price: "$0", credits: "50/mo", features: ["1 character", "Standard quality", "Community gallery"] },
                  { tier: "Pro", price: "$9.99/mo", credits: "1,000/mo", features: ["5 characters", "HD quality", "Priority queue", "Private gallery"] },
                  { tier: "Business", price: "$29.99/mo", credits: "5,000/mo", features: ["Unlimited chars", "4K quality", "API access", "Team seats", "Dedicated support"] },
                ].map((t) => (
                  <div key={t.tier} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <p className="font-semibold text-gray-200">{t.tier}</p>
                    <p className="text-xl font-bold text-purple-400 mt-1">{t.price}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.credits} credits</p>
                    <ul className="mt-3 space-y-1">
                      {t.features.map((f) => (
                        <li key={f} className="text-xs text-gray-400 flex items-center gap-1"><I n="check" s={12} /> {f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Credit Packs</h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { credits: 500, price: "$4.99", bonus: null },
                  { credits: 1000, price: "$8.99", bonus: "+100 bonus" },
                  { credits: 3000, price: "$24.99", bonus: "+500 bonus" },
                  { credits: 10000, price: "$74.99", bonus: "+2,000 bonus" },
                ].map((p) => (
                  <div key={p.credits} className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-center">
                    <p className="text-lg font-bold text-amber-400">{p.credits.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">credits</p>
                    <p className="text-sm font-semibold text-gray-200 mt-1">{p.price}</p>
                    {p.bonus && <Badge color="green">{p.bonus}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAnalytics = () => {
    const tabs = [
      { id: "funnel", label: "User Funnel" },
      { id: "genstats", label: "Generation Stats" },
      { id: "revenue", label: "Revenue" },
      { id: "trends", label: "Content Trends" },
    ];
    return (
      <div className="space-y-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setAnalyticsTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${analyticsTab === t.id ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {analyticsTab === "funnel" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Conversion Funnel</h3>
              {[
                { stage: "Visited Site", count: 48200, pct: 100, color: "from-purple-400 to-indigo-500" },
                { stage: "Signed Up", count: 4820, pct: 10, color: "from-blue-400 to-cyan-500" },
                { stage: "Created Character", count: 2892, pct: 60, color: "from-amber-400 to-orange-500" },
                { stage: "First Generation", count: 2024, pct: 70, color: "from-green-400 to-emerald-500" },
                { stage: "Purchased Credits", count: 891, pct: 44, color: "from-pink-400 to-rose-500" },
                { stage: "Subscribed", count: 438, pct: 49, color: "from-red-400 to-orange-500" },
              ].map((s, i) => (
                <div key={s.stage} className="mb-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300">{s.stage}</span>
                    <span className="text-gray-500">{s.count.toLocaleString()} {i > 0 ? `(${s.pct}% of prev)` : ""}</span>
                  </div>
                  <div className="w-full h-6 bg-gray-900 rounded overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${s.color} rounded flex items-center pl-2`} style={{ width: `${Math.max((s.count / 48200) * 100, 3)}%` }}>
                      <span className="text-[10px] text-white font-medium">{s.count.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {analyticsTab === "genstats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Stat label="Total Generations" value="142,800" trend={18} />
              <Stat label="Today" value="1,203" trend={23} />
              <Stat label="Avg per User" value="50.2" trend={5} />
              <Stat label="Failure Rate" value="0.8%" trend={-2} />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Generation Volume (7 days)</h3>
              <div className="flex items-end gap-2 h-40">
                {[980, 1050, 890, 1203, 1140, 1350, 1100].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-500">{v}</span>
                    <div className="w-full bg-gradient-to-t from-purple-500 to-indigo-400 rounded-t" style={{ height: `${(v / 1350) * 100}%` }} />
                    <span className="text-[10px] text-gray-500">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Type Breakdown</h3>
              {[
                { type: "Image — Standard", count: "82,400", pct: 58 },
                { type: "Image — HD", count: "28,560", pct: 20 },
                { type: "Video — Short", count: "21,420", pct: 15 },
                { type: "Video — Long", count: "10,420", pct: 7 },
              ].map((t) => (
                <div key={t.type} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{t.type}</span>
                    <span className="text-gray-500">{t.count} ({t.pct}%)</span>
                  </div>
                  <ProgBar pct={t.pct} color="from-purple-400 to-indigo-500" />
                </div>
              ))}
            </div>
          </div>
        )}
        {analyticsTab === "revenue" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Stat label="MRR" value="$12,400" trend={11} />
              <Stat label="ARR" value="$148,800" trend={11} />
              <Stat label="ARPU" value="$4.36" trend={3} />
              <Stat label="Net Revenue" value="$34,200" sub="this month" trend={8} />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Monthly Revenue</h3>
              <div className="flex items-end gap-2 h-40">
                {[18200, 22400, 24800, 28100, 31400, 34200].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-500">${(v / 1000).toFixed(1)}k</span>
                    <div className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t" style={{ height: `${(v / 34200) * 100}%` }} />
                    <span className="text-[10px] text-gray-500">{["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"][i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Revenue Sources</h3>
              {[
                { src: "Subscriptions", amt: "$12,400", pct: 36 },
                { src: "Credit Packs", amt: "$15,200", pct: 44 },
                { src: "Business Plans", amt: "$5,100", pct: 15 },
                { src: "Enterprise", amt: "$1,500", pct: 5 },
              ].map((r) => (
                <div key={r.src} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{r.src}</span>
                    <span className="text-gray-500">{r.amt} ({r.pct}%)</span>
                  </div>
                  <ProgBar pct={r.pct} color="from-green-400 to-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        )}
        {analyticsTab === "trends" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Popular Templates</h3>
              {[
                { name: "Golden Hour Portrait", uses: 4200, trend: 12 },
                { name: "City Night", uses: 3100, trend: 8 },
                { name: "Beach Sunset", uses: 2800, trend: -3 },
                { name: "Street Fashion", uses: 2400, trend: 15 },
                { name: "Studio Minimal", uses: 1900, trend: 22 },
              ].map((t, i) => (
                <div key={t.name} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-4">#{i + 1}</span>
                    <span className="text-sm text-gray-300">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{t.uses.toLocaleString()} uses</span>
                    <span className={`text-xs ${t.trend > 0 ? "text-green-400" : "text-red-400"}`}>{t.trend > 0 ? "↑" : "↓"} {Math.abs(t.trend)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Top Categories</h3>
                {[
                  { cat: "Fashion", pct: 35 },
                  { cat: "Portrait", pct: 28 },
                  { cat: "Lifestyle", pct: 22 },
                  { cat: "Street", pct: 15 },
                ].map((c) => (
                  <div key={c.cat} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{c.cat}</span>
                      <span className="text-gray-500">{c.pct}%</span>
                    </div>
                    <ProgBar pct={c.pct} color="from-amber-400 to-orange-500" />
                  </div>
                ))}
              </div>
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Reference Modes Used</h3>
                {[
                  { mode: "Face Only", pct: 40 },
                  { mode: "Pose & BG", pct: 32 },
                  { mode: "Clothing", pct: 18 },
                  { mode: "Custom", pct: 10 },
                ].map((m) => (
                  <div key={m.mode} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{m.mode}</span>
                      <span className="text-gray-500">{m.pct}%</span>
                    </div>
                    <ProgBar pct={m.pct} color="from-purple-400 to-indigo-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderModeration = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Pending Review" value={queue.length} />
        <Stat label="Approved Today" value="24" trend={12} />
        <Stat label="Rejected Today" value="3" />
        <Stat label="Auto-flagged" value="7" sub="this week" />
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Policy Violations (last 30 days)</h3>
        {[
          { type: "Explicit Content", count: 12, severity: "high" },
          { type: "Copyright Infringement", count: 8, severity: "high" },
          { type: "Spam / Low Quality", count: 23, severity: "medium" },
          { type: "Impersonation", count: 3, severity: "medium" },
          { type: "Other", count: 5, severity: "low" },
        ].map((v) => (
          <div key={v.type} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-300">{v.type}</span>
              <Badge color={v.severity === "high" ? "red" : v.severity === "medium" ? "amber" : "gray"}>{v.severity}</Badge>
            </div>
            <span className="text-gray-400">{v.count} incidents</span>
          </div>
        ))}
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Auto-Moderation Settings</h3>
        {[
          { label: "NSFW Detection", desc: "Automatically flag explicit content", on: true },
          { label: "Copyright Scanner", desc: "Detect copyrighted logos and brands", on: true },
          { label: "Spam Filter", desc: "Block low-quality or duplicate submissions", on: false },
          { label: "Face Verification", desc: "Verify character ownership", on: true },
        ].map((s) => (
          <div key={s.label} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
            <div>
              <p className="text-sm text-gray-300">{s.label}</p>
              <p className="text-xs text-gray-500">{s.desc}</p>
            </div>
            <Toggle on={s.on} onToggle={() => {}} />
          </div>
        ))}
      </div>
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Moderation Log</h3>
        {AUDIT_LOG.filter((e) => e.action.includes("Approved") || e.action.includes("Rejected") || e.action.includes("Suspended")).map((e) => (
          <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold">{e.admin[0]}</div>
              <span className="text-gray-300">{e.admin}</span>
              <span className="text-gray-500">{e.action}</span>
              <span className="text-gray-400">{e.target}</span>
            </div>
            <span className="text-xs text-gray-600">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => {
    const tabs = [
      { id: "generation", label: "Generation Config" },
      { id: "features", label: "Feature Flags" },
      { id: "notifications", label: "Notifications" },
      { id: "system", label: "System" },
    ];
    return (
      <div className="space-y-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setSettingsTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${settingsTab === t.id ? "bg-purple-500/20 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {settingsTab === "generation" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Generation Limits</h3>
              {[
                { label: "Max concurrent jobs (Free)", value: "1" },
                { label: "Max concurrent jobs (Pro)", value: "3" },
                { label: "Max concurrent jobs (Business)", value: "10" },
                { label: "Max image resolution", value: "2048×2048" },
                { label: "Max video length", value: "30s" },
                { label: "Daily limit (Free)", value: "5 generations" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <span className="text-sm text-gray-400">{s.label}</span>
                  <input defaultValue={s.value} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 w-32 text-right focus:outline-none focus:border-purple-500" />
                </div>
              ))}
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Queue Priority</h3>
              {[
                { label: "Business tier priority", desc: "Process business jobs first", on: true },
                { label: "Pro tier boost", desc: "2x priority for Pro users", on: true },
                { label: "FIFO fallback", desc: "Fall back to first-in-first-out ordering", on: false },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                  <div><p className="text-sm text-gray-300">{s.label}</p><p className="text-xs text-gray-500">{s.desc}</p></div>
                  <Toggle on={s.on} onToggle={() => {}} />
                </div>
              ))}
            </div>
          </div>
        )}
        {settingsTab === "features" && (
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Feature Flags</h3>
            {[
              { label: "Video Generation", desc: "Enable video output", tiers: ["Pro", "Business"], on: true },
              { label: "HD Export", desc: "Allow 2048×2048 exports", tiers: ["Pro", "Business"], on: true },
              { label: "4K Export", desc: "Allow 4096×4096 exports", tiers: ["Business"], on: false },
              { label: "API Access", desc: "REST API for generations", tiers: ["Business"], on: true },
              { label: "Custom Watermark", desc: "Upload custom branding", tiers: ["Business"], on: false },
              { label: "Batch Generation", desc: "Generate multiple images at once", tiers: ["Pro", "Business"], on: true },
              { label: "Reference Mode — Custom", desc: "Free-text reference descriptions", tiers: ["Pro", "Business"], on: true },
              { label: "Private Gallery", desc: "Hide gallery from public", tiers: ["Pro", "Business"], on: true },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-300">{f.label}</p>
                    {f.tiers.map((t) => (
                      <Badge key={t} color={t === "Business" ? "blue" : "purple"}>{t}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                </div>
                <Toggle on={f.on} onToggle={() => {}} />
              </div>
            ))}
          </div>
        )}
        {settingsTab === "notifications" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Email Templates</h3>
              {[
                { label: "Welcome Email", status: "active", lastEdit: "Feb 10" },
                { label: "Subscription Confirmation", status: "active", lastEdit: "Jan 28" },
                { label: "Credit Purchase Receipt", status: "active", lastEdit: "Jan 15" },
                { label: "Account Suspension Notice", status: "draft", lastEdit: "Feb 5" },
                { label: "Re-engagement (30-day inactive)", status: "active", lastEdit: "Dec 20" },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-300">{t.label}</span>
                    <Badge color={t.status === "active" ? "green" : "amber"}>{t.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Edited {t.lastEdit}</span>
                    <button className="text-xs text-purple-400 hover:text-purple-300">Edit</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Scheduled Reports</h3>
              {[
                { label: "Daily Revenue Summary", schedule: "Every day at 9:00 AM", on: true },
                { label: "Weekly User Growth", schedule: "Every Monday at 8:00 AM", on: true },
                { label: "Moderation Digest", schedule: "Every day at 6:00 PM", on: false },
                { label: "Monthly Analytics", schedule: "1st of each month", on: true },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                  <div><p className="text-sm text-gray-300">{r.label}</p><p className="text-xs text-gray-500">{r.schedule}</p></div>
                  <Toggle on={r.on} onToggle={() => {}} />
                </div>
              ))}
            </div>
          </div>
        )}
        {settingsTab === "system" && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">System Toggles</h3>
              {[
                { label: "Maintenance Mode", desc: "Show maintenance page to all users", on: false },
                { label: "Registration Open", desc: "Allow new user sign-ups", on: true },
                { label: "Public Gallery", desc: "Gallery visible to non-authenticated visitors", on: true },
                { label: "Debug Logging", desc: "Enable verbose server logs", on: false },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                  <div><p className="text-sm text-gray-300">{s.label}</p><p className="text-xs text-gray-500">{s.desc}</p></div>
                  <Toggle on={s.on} onToggle={() => {}} />
                </div>
              ))}
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">API Keys</h3>
              {[
                { label: "Production", key: "pk_live_••••••••4f2a", created: "Nov 15, 2025" },
                { label: "Staging", key: "pk_test_••••••••8b1c", created: "Oct 3, 2025" },
              ].map((k) => (
                <div key={k.label} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-300">{k.label}</p>
                    <code className="text-xs text-gray-500">{k.key}</code>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs text-purple-400 hover:text-purple-300">Reveal</button>
                    <button className="text-xs text-red-400 hover:text-red-300">Rotate</button>
                  </div>
                </div>
              ))}
              <Btn sm className="mt-3"><I n="plus" s={14} /> Create Key</Btn>
            </div>
            <div className="bg-red-500/5 rounded-xl p-5 border border-red-500/20">
              <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm text-gray-300">Purge Generation Cache</p><p className="text-xs text-gray-500">Clear all cached generation results</p></div>
                  <Btn sm danger>Purge Cache</Btn>
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm text-gray-300">Reset All Feature Flags</p><p className="text-xs text-gray-500">Revert all flags to default values</p></div>
                  <Btn sm danger>Reset Flags</Btn>
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm text-gray-300">Export Full Database</p><p className="text-xs text-gray-500">Download complete database dump</p></div>
                  <Btn sm danger><I n="download" s={14} /> Export DB</Btn>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (page === "dashboard") return renderDashboard();
    if (page === "users") return renderUsers();
    if (page === "gallery") return renderGallery();
    if (page === "credits") return renderCredits();
    if (page === "analytics") return renderAnalytics();
    if (page === "moderation") return renderModeration();
    if (page === "settings") return renderSettings();
    return null;
  };

  // ── MAIN LAYOUT ──
  return (
    <div className="h-screen overflow-hidden flex bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-gray-800">
          <ParrotLogo sz={24} />
          <span className="font-bold text-sm">Parrot</span>
          <Badge color="purple">Admin</Badge>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {NAV.map((item) => {
            const active = page === item.id;
            const expanded = expandedNav === item.id;
            const hasSubs = item.subs && item.subs.length > 0;

            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (hasSubs) {
                      setExpandedNav(expanded ? null : item.id);
                      nav(item.id, item.subs[0].id);
                    } else {
                      setExpandedNav(null);
                      nav(item.id);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-purple-500/20 text-purple-300" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                >
                  <I n={item.icon} s={16} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "moderation" && queue.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{queue.length}</span>
                  )}
                  {hasSubs && (
                    <I n={expanded ? "chevL" : "chevR"} s={12} />
                  )}
                </button>
                {hasSubs && expanded && (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-800 pl-2">
                    {item.subs.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => nav(item.id, sub.id)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${isActive(item.id, sub.id) ? "text-purple-300 bg-purple-500/10" : "text-gray-500 hover:text-gray-300"}`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t border-gray-800 space-y-2">
          <Btn
            sm
            className="w-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
            onClick={onCreator}
          >
            <I n="sparkle" s={14} /> Switch to Creator
          </Btn>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">A</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">Alex Morgan</p>
              <p className="text-[10px] text-gray-600 truncate">alex@parrot.studio</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-200">{breadcrumb()}</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                placeholder="Search..."
                className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 w-48 focus:outline-none focus:border-purple-500"
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"><I n="search" s={14} /></div>
            </div>
            <button className="relative text-gray-400 hover:text-white">
              <I n="bell" s={18} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowDrop(!showDrop)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold"
              >
                A
              </button>
              {showDrop && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDrop(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-700">
                      <p className="font-semibold text-white text-sm">Alex Morgan</p>
                      <p className="text-xs text-gray-400">alex@parrot.studio</p>
                    </div>
                    <div className="p-1">
                      <button className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg flex items-center gap-2">
                        <I n="user" s={14} /> Profile
                      </button>
                      <button className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg flex items-center gap-2">
                        <I n="settings" s={14} /> Settings
                      </button>
                      <button onClick={() => { setShowDrop(false); onCreator(); }} className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-gray-700 rounded-lg flex items-center gap-2">
                        <I n="sparkle" s={14} /> Switch to Creator
                      </button>
                    </div>
                    <div className="border-t border-gray-700 p-1">
                      <button onClick={onLogout} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 rounded-lg flex items-center gap-2">
                        <I n="ext" s={14} /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
