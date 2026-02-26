"use client";

import { Suspense } from "react";
import AppNavbar from "@/components/AppNavbar";
import CharacterSidebar from "@/components/CharacterSidebar";
import OnboardingWizard from "@/components/OnboardingWizard";
import ProtectedRoute from "@/components/ProtectedRoute";
import { CharacterProvider, useCharacter } from "@/contexts/CharacterContext";

function StudioShell({ children }: { children: React.ReactNode }) {
  const {
    characters,
    selectedCharacter,
    baseImages,
    loading,
    showOnboarding,
    setShowOnboarding,
    selectCharacter,
    loadCharacters,
    charactersLoaded,
    handleCreateCharacter,
    handleDeleteCharacter,
    handleApproveImage,
    handleDeleteImage,
    refreshBaseImages,
  } = useCharacter();

  if (showOnboarding && charactersLoaded) {
    return (
      <OnboardingWizard
        onComplete={async (characterId) => {
          setShowOnboarding(false);
          await loadCharacters();
          selectCharacter(characterId);
        }}
        onSkip={() => setShowOnboarding(false)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <AppNavbar loading={loading} />
      <div className="fixed inset-0 pt-20 p-4 overflow-hidden">
        <div className="h-full w-full grid grid-cols-[260px_minmax(0,1fr)] gap-4 min-h-0">
          <CharacterSidebar
            characters={characters}
            selectedCharacter={selectedCharacter}
            baseImages={baseImages}
            onSelect={selectCharacter}
            onCreate={async (name, desc, gender, refPaths) => { await handleCreateCharacter(name, desc, gender, refPaths); }}
            onDeleteCharacter={handleDeleteCharacter}
            onApproveImage={handleApproveImage}
            onDeleteImage={handleDeleteImage}
            onRefresh={refreshBaseImages}
            onStartOnboarding={() => setShowOnboarding(true)}
            loading={loading}
          />
          <div className="h-full min-h-0 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CharacterProvider>
        <Suspense
          fallback={
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
              <span className="text-white animate-pulse">Loading...</span>
            </div>
          }
        >
          <StudioShell>{children}</StudioShell>
        </Suspense>
      </CharacterProvider>
    </ProtectedRoute>
  );
}
