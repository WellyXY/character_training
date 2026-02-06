"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AppNavbarProps {
  loading?: boolean;
  statusText?: string;
}

export default function AppNavbar({ loading, statusText }: AppNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const isInspiration = pathname.startsWith("/samples");
  const isStudio = pathname === "/";

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#333] bg-black/50 backdrop-blur-md">
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-white">
          AI Studio
        </h1>

        {/* Navigation Links */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-[#1a1a1a] border border-[#333]">
          <Link
            href="/samples"
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wide transition-all ${
              isInspiration
                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                : "text-gray-400 hover:text-white hover:bg-[#222]"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Inspiration
          </Link>
          <Link
            href="/"
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wide transition-all ${
              isStudio
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "text-gray-400 hover:text-white hover:bg-[#222]"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            Studio
          </Link>
        </div>

        {/* Status + User Info */}
        <div className="flex items-center gap-4 min-w-[200px] justify-end">
          {loading && (
            <span className="text-xs text-amber-400 animate-pulse">
              Processing...
            </span>
          )}
          {statusText && !loading && (
            <span className="text-xs text-gray-400">{statusText}</span>
          )}

          {/* Token Balance */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-3">
              {/* Token Display */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333]">
                <svg
                  className="w-4 h-4 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" fill="currentColor" />
                  <text
                    x="12"
                    y="16"
                    textAnchor="middle"
                    fontSize="10"
                    fill="black"
                    fontWeight="bold"
                  >
                    T
                  </text>
                </svg>
                <span className="text-sm font-mono font-bold text-amber-400">
                  {user.token_balance}
                </span>
              </div>

              {/* User Menu */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">
                  {user.username}
                </span>
                {/* Admin Link */}
                {user.is_admin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wide text-yellow-400 hover:text-yellow-300 hover:bg-[#222] transition-all border border-yellow-400/30"
                    title="Admin Settings"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wide text-gray-400 hover:text-white hover:bg-[#222] transition-all border border-[#333]"
                  title="Logout"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
