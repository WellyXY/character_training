"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateTokens,
  adminUpdateRole,
  adminDeleteUser,
  adminListCharacters,
  adminGetInstagramCookiesStatus,
  adminSetInstagramCookies,
  adminGetUserCharacterAccess,
  adminSetUserCharacterAccess,
  getLipsyncPresets,
  adminUploadLipsyncPreset,
  adminDeleteLipsyncPreset,
  type AdminUser,
  type AdminCharacter,
  type LipsyncPreset,
} from "@/lib/api";

type Tab = "users" | "characters" | "settings";
type AccessModalState = { userId: string; username: string };

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [characters, setCharacters] = useState<AdminCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    token_balance: 100,
    role: "user",
  });
  const [creating, setCreating] = useState(false);

  // Token update
  const [tokenUpdate, setTokenUpdate] = useState<{ userId: string; amount: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Character access modal
  const [accessModal, setAccessModal] = useState(null as AccessModalState | null);
  const [accessSelected, setAccessSelected] = useState([] as string[]);
  const [accessSaving, setAccessSaving] = useState(false);

  // Instagram cookies
  const [igCookiesSet, setIgCookiesSet] = useState(false);
  const [igCookiesUpdatedAt, setIgCookiesUpdatedAt] = useState<string | null>(null);
  const [igCookiesText, setIgCookiesText] = useState("");
  const [igCookiesSaving, setIgCookiesSaving] = useState(false);
  const [igCookiesMsg, setIgCookiesMsg] = useState("");

  // Lipsync presets
  const [lipsyncPresets, setLipsyncPresets] = useState<LipsyncPreset[]>([]);
  const [lipsyncUploadFile, setLipsyncUploadFile] = useState<File | null>(null);
  const [lipsyncUploadName, setLipsyncUploadName] = useState("");
  const [lipsyncUploading, setLipsyncUploading] = useState(false);
  const [lipsyncMsg, setLipsyncMsg] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (user && !user.is_admin) {
      router.push("/");
      return;
    }
    loadData();
    loadIgCookiesStatus();
    loadLipsyncPresets();
  }, [isAuthenticated, user, router]);

  const openAccessModal = async (u: AdminUser) => {
    try {
      const { character_ids } = await adminGetUserCharacterAccess(u.id);
      setAccessSelected(character_ids);
      setAccessModal({ userId: u.id, username: u.username });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load character access");
    }
  };

  const saveAccess = async () => {
    if (!accessModal) return;
    setAccessSaving(true);
    try {
      await adminSetUserCharacterAccess(accessModal.userId, accessSelected);
      setAccessModal(null);
    } finally {
      setAccessSaving(false);
    }
  };

  const toggleCharacter = (id: string) => {
    setAccessSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const loadIgCookiesStatus = async () => {
    try {
      const status = await adminGetInstagramCookiesStatus();
      setIgCookiesSet(status.set);
      setIgCookiesUpdatedAt(status.updated_at);
    } catch {}
  };

  const saveIgCookies = async () => {
    if (!igCookiesText.trim()) return;
    setIgCookiesSaving(true);
    setIgCookiesMsg("");
    try {
      await adminSetInstagramCookies(igCookiesText.trim());
      setIgCookiesMsg("Saved!");
      setIgCookiesSet(true);
      setIgCookiesUpdatedAt(new Date().toISOString());
      setIgCookiesText("");
    } catch (e) {
      setIgCookiesMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIgCookiesSaving(false);
    }
  };

  const loadLipsyncPresets = async () => {
    try {
      const presets = await getLipsyncPresets();
      setLipsyncPresets(presets);
    } catch {}
  };

  const uploadLipsyncPreset = async () => {
    if (!lipsyncUploadFile || !lipsyncUploadName.trim()) return;
    setLipsyncUploading(true);
    setLipsyncMsg("");
    try {
      const preset = await adminUploadLipsyncPreset(lipsyncUploadFile, lipsyncUploadName.trim());
      setLipsyncPresets(prev => [...prev, preset]);
      setLipsyncUploadFile(null);
      setLipsyncUploadName("");
      setLipsyncMsg("Uploaded!");
    } catch (e) {
      setLipsyncMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLipsyncUploading(false);
    }
  };

  const deleteLipsyncPreset = async (id: string) => {
    try {
      await adminDeleteLipsyncPreset(id);
      setLipsyncPresets(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      setLipsyncMsg(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersData, charsData] = await Promise.all([
        adminListUsers(),
        adminListCharacters(),
      ]);
      setUsers(usersData);
      setCharacters(charsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await adminCreateUser({
        ...newUser,
        is_admin: newUser.role === "admin",
      });
      setUsers((prev) => [created, ...prev]);
      setShowCreateForm(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        token_balance: 100,
        role: "user",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTokens = async (userId: string) => {
    if (!tokenUpdate || tokenUpdate.userId !== userId) return;
    const amount = parseInt(tokenUpdate.amount);
    if (isNaN(amount)) return;

    setUpdating(true);
    setError("");
    try {
      const updated = await adminUpdateTokens(userId, amount);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      setTokenUpdate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tokens");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    setUpdating(true);
    setError("");
    try {
      const updated = await adminUpdateRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeleting(true);
    setError("");
    try {
      await adminDeleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  if (!isAuthenticated || !user?.is_admin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400 font-mono">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-[#333] p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-mono font-bold">Admin Settings</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-400 hover:text-white font-mono"
          >
            Back to Home
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#333]">
        <div className="max-w-6xl mx-auto flex">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 text-sm font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-white text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("characters")}
            className={`px-6 py-3 text-sm font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === "characters"
                ? "border-white text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Characters ({characters.length})
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 text-sm font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === "settings"
                ? "border-white text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-300 font-mono">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400 font-mono">Loading...</p>
          </div>
        ) : activeTab === "users" ? (
          <div>
            {/* Create User Button */}
            <div className="mb-4">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 bg-white text-black text-xs font-mono font-bold uppercase tracking-wide rounded-lg hover:bg-gray-200"
              >
                {showCreateForm ? "Cancel" : "+ Create User"}
              </button>
            </div>

            {/* Create User Form */}
            {showCreateForm && (
              <form
                onSubmit={handleCreateUser}
                className="mb-6 p-4 bg-[#111] border border-[#333] rounded-lg"
              >
                <h3 className="text-sm font-mono font-bold uppercase tracking-wide mb-4">
                  Create New User
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) =>
                        setNewUser({ ...newUser, username: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-black border border-[#333] rounded-lg text-sm font-mono focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) =>
                        setNewUser({ ...newUser, email: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-black border border-[#333] rounded-lg text-sm font-mono focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser({ ...newUser, password: e.target.value })
                      }
                      required
                      className="w-full px-3 py-2 bg-black border border-[#333] rounded-lg text-sm font-mono focus:outline-none focus:border-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">
                      Initial Tokens
                    </label>
                    <input
                      type="number"
                      value={newUser.token_balance}
                      onChange={(e) =>
                        setNewUser({
                          ...newUser,
                          token_balance: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 bg-black border border-[#333] rounded-lg text-sm font-mono focus:outline-none focus:border-white/50"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 font-mono mb-1">
                    Role
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-3 py-2 bg-black border border-[#333] rounded-lg text-sm font-mono focus:outline-none focus:border-white/50"
                  >
                    <option value="user">User</option>
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-white text-black text-xs font-mono font-bold uppercase tracking-wide rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </form>
            )}

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Username
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Email
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Tokens
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Role
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Created
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-[#222] hover:bg-white/5">
                      <td className="py-3 px-2 font-mono text-sm">{u.username}</td>
                      <td className="py-3 px-2 font-mono text-sm text-gray-400">
                        {u.email}
                      </td>
                      <td className="py-3 px-2 font-mono text-sm">
                        {tokenUpdate?.userId === u.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={tokenUpdate.amount}
                              onChange={(e) =>
                                setTokenUpdate({ ...tokenUpdate, amount: e.target.value })
                              }
                              className="w-20 px-2 py-1 bg-black border border-[#333] rounded text-xs font-mono"
                              placeholder="+/-"
                            />
                            <button
                              onClick={() => handleUpdateTokens(u.id)}
                              disabled={updating}
                              className="text-xs text-green-400 hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setTokenUpdate(null)}
                              className="text-xs text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            onClick={() => setTokenUpdate({ userId: u.id, amount: "" })}
                            className="cursor-pointer hover:text-blue-400"
                          >
                            {u.token_balance}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <select
                          value={u.role || (u.is_admin ? "admin" : "user")}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                          disabled={u.id === user?.id || updating}
                          className={`text-xs font-mono px-2 py-1 rounded bg-transparent border cursor-pointer disabled:cursor-not-allowed ${
                            (u.role || (u.is_admin ? "admin" : "user")) === "admin"
                              ? "border-yellow-400/50 text-yellow-400"
                              : (u.role || "user") === "developer"
                              ? "border-blue-400/50 text-blue-400"
                              : "border-gray-500/50 text-gray-400"
                          }`}
                        >
                          <option value="user">User</option>
                          <option value="developer">Developer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-2 font-mono text-sm text-gray-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setTokenUpdate({ userId: u.id, amount: "" })}
                            className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                          >
                            Tokens
                          </button>
                          <button
                            onClick={() => openAccessModal(u)}
                            className="text-xs text-purple-400 hover:text-purple-300 font-mono"
                          >
                            Access
                          </button>
                          {u.id !== user?.id && (
                            <>
                              {deleteConfirm === u.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    disabled={deleting}
                                    className="text-xs text-red-400 hover:text-red-300 font-mono"
                                  >
                                    {deleting ? "..." : "Confirm"}
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-xs text-gray-400 hover:text-white font-mono"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(u.id)}
                                  className="text-xs text-red-400 hover:text-red-300 font-mono"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "characters" ? (
          <div>
            {/* Characters Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Name
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Owner
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Status
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Base Images
                    </th>
                    <th className="text-left text-xs text-gray-400 font-mono uppercase tracking-wide py-3 px-2">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {characters.map((c) => (
                    <tr key={c.id} className="border-b border-[#222] hover:bg-white/5">
                      <td className="py-3 px-2 font-mono text-sm">{c.name}</td>
                      <td className="py-3 px-2 font-mono text-sm text-gray-400">
                        {c.owner_username}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`text-xs font-mono px-2 py-1 rounded ${
                            c.status === "active"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono text-sm">{c.base_image_count}</td>
                      <td className="py-3 px-2 font-mono text-sm text-gray-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "settings" ? (
          <div className="max-w-xl space-y-6 py-4">
            {/* Instagram Cookies */}
            <div className="border border-[#333] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-white">
                  Instagram Cookies
                </h2>
                <span
                  className={`text-xs font-mono px-2 py-1 rounded ${
                    igCookiesSet
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {igCookiesSet ? "Active" : "Not set"}
                </span>
              </div>
              {igCookiesSet && igCookiesUpdatedAt && (
                <p className="text-xs text-gray-500 font-mono">
                  Last updated: {new Date(igCookiesUpdatedAt).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-gray-400 font-mono leading-relaxed">
                只需貼上 Instagram 的 <span className="text-white">sessionid</span> 值。
                開啟 instagram.com → F12 → Application → Cookies → instagram.com → 找 sessionid → 複製值
              </p>
              <input
                type="text"
                value={igCookiesText}
                onChange={(e) => setIgCookiesText(e.target.value)}
                placeholder="貼上 sessionid 值..."
                className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
              />
              {igCookiesMsg && (
                <p className={`text-xs font-mono ${igCookiesMsg === "Saved!" ? "text-green-400" : "text-red-400"}`}>
                  {igCookiesMsg}
                </p>
              )}
              <button
                onClick={saveIgCookies}
                disabled={igCookiesSaving || !igCookiesText.trim()}
                className="w-full rounded-lg bg-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
              >
                {igCookiesSaving ? "Saving..." : "Update Cookies"}
              </button>
            </div>

            {/* Lipsync Presets */}
            <div className="border border-[#333] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-white">
                Lipsync Sample Images
              </h2>

              {/* Current presets grid */}
              {lipsyncPresets.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {lipsyncPresets.map((preset) => (
                    <div key={preset.id} className="relative group rounded-lg overflow-hidden aspect-[3/4] border border-[#333]">
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                        <p className="text-white text-[10px] font-mono text-center truncate w-full px-1">{preset.name}</p>
                        <button
                          onClick={() => deleteLipsyncPreset(preset.id)}
                          className="text-[10px] font-mono text-red-400 hover:text-red-300 border border-red-400/50 rounded px-2 py-0.5"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-mono">Using built-in defaults (upload to override):</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "char1", url: "/lipsync-presets/char1.png", name: "Character 1" },
                      { id: "char2", url: "/lipsync-presets/char2.png", name: "Character 2" },
                      { id: "char3", url: "/lipsync-presets/char3.jpg", name: "Character 3" },
                      { id: "char4", url: "/lipsync-presets/char4.jpg", name: "Character 4" },
                    ].map((p) => (
                      <div key={p.id} className="relative rounded-lg overflow-hidden aspect-[3/4] border border-[#444] opacity-60">
                        <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                          <p className="text-[9px] font-mono text-gray-400 text-center truncate">Default</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload form */}
              <div className="space-y-2 pt-2 border-t border-[#222]">
                <p className="text-xs text-gray-400 font-mono">Add new preset</p>
                <input
                  type="text"
                  value={lipsyncUploadName}
                  onChange={(e) => setLipsyncUploadName(e.target.value)}
                  placeholder="Name (e.g. Character 5)"
                  className="w-full rounded-lg border border-[#333] bg-[#0b0b0b] px-3 py-2 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLipsyncUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-gray-400 font-mono file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-mono file:bg-white/10 file:text-white hover:file:bg-white/20"
                />
                {lipsyncMsg && (
                  <p className={`text-xs font-mono ${lipsyncMsg === "Uploaded!" ? "text-green-400" : "text-red-400"}`}>
                    {lipsyncMsg}
                  </p>
                )}
                <button
                  onClick={uploadLipsyncPreset}
                  disabled={lipsyncUploading || !lipsyncUploadFile || !lipsyncUploadName.trim()}
                  className="w-full rounded-lg bg-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
                >
                  {lipsyncUploading ? "Uploading..." : "Upload Preset"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Character Access Modal */}
      {accessModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setAccessModal(null)}>
          <div className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-white">Character Access</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{accessModal.username}</p>
              </div>
              <button onClick={() => setAccessModal(null)} className="w-8 h-8 rounded-full bg-white/10 text-white text-sm hover:bg-white/20">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {characters.length === 0 ? (
                <p className="text-xs text-gray-500 font-mono">No characters found.</p>
              ) : (
                characters.map(c => (
                  <label key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#333] hover:border-white/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accessSelected.includes(c.id)}
                      onChange={() => toggleCharacter(c.id)}
                      className="w-4 h-4 accent-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-white truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{c.owner_username}</p>
                    </div>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${c.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
                      {c.status}
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex gap-2">
              <button
                onClick={saveAccess}
                disabled={accessSaving}
                className="flex-1 rounded-lg bg-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wide text-black hover:bg-gray-200 disabled:opacity-50"
              >
                {accessSaving ? "Saving..." : `Save (${accessSelected.length} selected)`}
              </button>
              <button onClick={() => setAccessModal(null)} className="rounded-lg bg-[#1a1a1a] border border-[#333] px-4 py-2 text-xs font-mono text-white hover:text-gray-300">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
