"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const LOGIN_VIDEOS = [
  "/videos/login-1.mp4",
  "/videos/login-2.mp4",
  "/videos/login-3.mp4",
];

const COUNT = LOGIN_VIDEOS.length;

// Position configs for left / center / right
const POSITIONS: Record<string, React.CSSProperties> = {
  left: {
    transform: "translateX(-72%) scale(0.7)",
    opacity: 0.45,
    zIndex: 1,
    filter: "brightness(0.6)",
  },
  center: {
    transform: "translateX(0%) scale(1)",
    opacity: 1,
    zIndex: 10,
    filter: "brightness(1)",
  },
  right: {
    transform: "translateX(72%) scale(0.7)",
    opacity: 0.45,
    zIndex: 1,
    filter: "brightness(0.6)",
  },
};

function getPosition(videoIdx: number, activeIdx: number): string {
  const diff = ((videoIdx - activeIdx) % COUNT + COUNT) % COUNT;
  if (diff === 0) return "center";
  if (diff === 1) return "right";
  return "left"; // diff === COUNT - 1
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carousel
  const [activeIndex, setActiveIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % COUNT);
  }, []);

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + COUNT) % COUNT);
  }, []);

  // Auto-play center video, pause others, auto-advance after 5s
  // Include isLoading so the effect re-runs once videos are rendered
  useEffect(() => {
    if (isLoading) return;

    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(goToNext, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, goToNext, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white animate-pulse font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Left side: Branding + Video Carousel */}
      <div className="hidden lg:flex lg:w-[58%] flex-col justify-center items-center px-10 border-r border-[#222] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/3" />

        <div className="relative z-10 w-full max-w-2xl space-y-8">
          {/* Logo + tagline */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold font-mono tracking-tight text-white">
              AI Studio
            </h1>
            <p className="text-sm text-gray-400 font-mono">
              Create AI characters. Generate stunning content.
            </p>
          </div>

          {/* Video Carousel */}
          <div className="relative flex items-center justify-center">
            {/* Left Arrow */}
            <button
              onClick={goToPrev}
              className="absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] text-white flex items-center justify-center hover:bg-[#333] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Cards container */}
            <div className="relative w-[48%] mx-auto" style={{ aspectRatio: "9/16" }}>
              {LOGIN_VIDEOS.map((src, idx) => {
                const pos = getPosition(idx, activeIndex);
                const isCenter = pos === "center";

                return (
                  <div
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={`absolute inset-0 rounded-2xl overflow-hidden cursor-pointer ${
                      isCenter
                        ? "border-2 border-white shadow-lg shadow-white/10"
                        : "border border-[#333]"
                    }`}
                    style={{
                      ...POSITIONS[pos],
                      transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), filter 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <video
                      ref={(el) => { videoRefs.current[idx] = el; }}
                      src={src}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />

                    {/* Play overlay on side cards */}
                    {!isCenter && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Arrow */}
            <button
              onClick={goToNext}
              className="absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] text-white flex items-center justify-center hover:bg-[#333] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Feature highlights */}
          <div className="flex justify-center gap-6">
            {[
              "Character Creation",
              "Image Generation",
              "Video Animation",
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-white shrink-0" />
                <span className="text-xs text-gray-500 font-mono">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side: Login form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden text-center space-y-2">
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">
              AI Studio
            </h1>
            <p className="text-sm text-gray-400 font-mono">Sign in to your account</p>
          </div>

          <div className="hidden lg:block">
            <h2 className="text-2xl font-bold font-mono text-white mb-2">
              Welcome back
            </h2>
            <p className="text-sm text-gray-500 font-mono">
              Sign in to continue to the studio
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm font-mono">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-mono font-bold uppercase tracking-widest text-gray-400 mb-2"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full bg-[#111] border border-[#333] rounded-lg px-4 py-3 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-mono font-bold uppercase tracking-widest text-gray-400 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#111] border border-[#333] rounded-lg px-4 py-3 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white hover:bg-gray-200 disabled:bg-white/50 text-black font-mono font-bold uppercase tracking-wide py-3 rounded-lg transition-colors"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 font-mono">
            Contact your administrator for account access
          </p>
        </div>
      </div>
    </div>
  );
}
