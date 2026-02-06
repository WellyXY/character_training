"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateTokens,
  adminListCharacters,
  type AdminUser,
  type AdminCharacter,
} from "@/lib/api";

type Tab = "users" | "characters";

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
    is_admin: false,
  });
  const [creating, setCreating] = useState(false);

  // Token update
  const [tokenUpdate, setTokenUpdate] = useState<{ userId: string; amount: string } | null>(null);
  const [updating, setUpdating] = useState(false);

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
  }, [isAuthenticated, user, router]);

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
      const created = await adminCreateUser(newUser);
      setUsers((prev) => [created, ...prev]);
      setShowCreateForm(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        token_balance: 100,
        is_admin: false,
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
                <div className="flex items-center gap-4 mb-4">
                  <label className="flex items-center gap-2 text-sm font-mono">
                    <input
                      type="checkbox"
                      checked={newUser.is_admin}
                      onChange={(e) =>
                        setNewUser({ ...newUser, is_admin: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    Admin User
                  </label>
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
                        <span
                          className={`text-xs font-mono px-2 py-1 rounded ${
                            u.is_admin
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {u.is_admin ? "Admin" : "User"}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono text-sm text-gray-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2">
                        <button
                          onClick={() => setTokenUpdate({ userId: u.id, amount: "" })}
                          className="text-xs text-blue-400 hover:text-blue-300 font-mono"
                        >
                          Add Tokens
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
