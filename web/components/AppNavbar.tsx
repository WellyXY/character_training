"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AppNavbarProps {
  loading?: boolean;
  statusText?: string;
}

export default function AppNavbar({ loading, statusText }: AppNavbarProps) {
  const pathname = usePathname();
  const isInspiration = pathname.startsWith("/samples");
  const isStudio = pathname === "/";

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

        {/* Status */}
        <div className="flex items-center gap-4 min-w-[120px] justify-end">
          {loading && (
            <span className="text-xs text-amber-400 animate-pulse">
              Processing...
            </span>
          )}
          {statusText && !loading && (
            <span className="text-xs text-gray-400">{statusText}</span>
          )}
        </div>
      </div>
    </nav>
  );
}
