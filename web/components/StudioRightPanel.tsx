"use client";

import type { ReactNode } from "react";

export type RightPanelTab = "image" | "video" | "assistant";

interface StudioRightPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  characterName: string | null;
  imageGenPanel: ReactNode;
  videoGenPanel: ReactNode;
  assistantPanel: ReactNode;
}

const TABS: { key: RightPanelTab; label: string; icon: ReactNode }[] = [
  {
    key: "image",
    label: "Image",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "video",
    label: "Video",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "assistant",
    label: "AI Chat",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
];

export default function StudioRightPanel({
  activeTab,
  onTabChange,
  characterName,
  imageGenPanel,
  videoGenPanel,
  assistantPanel,
}: StudioRightPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Tab Bar */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex gap-1 p-1 rounded-xl bg-[#111] border border-[#333]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "bg-white text-black"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "image" && imageGenPanel}
        {activeTab === "video" && videoGenPanel}
        {activeTab === "assistant" && assistantPanel}
      </div>
    </div>
  );
}
