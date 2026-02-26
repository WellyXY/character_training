"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { Character, Image } from "@/lib/types";
import {
  listCharacters,
  listCharacterImages,
  createCharacter as apiCreate,
  deleteCharacter as apiDelete,
  approveImage as apiApprove,
  deleteImage as apiDeleteImg,
} from "@/lib/api";

interface CharacterContextType {
  characters: Character[];
  selectedCharacter: Character | null;
  selectedCharacterId: string | null;
  baseImages: Image[];
  loading: boolean;
  charactersLoaded: boolean;
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
  selectCharacter: (id: string | null) => void;
  loadCharacters: () => Promise<void>;
  refreshBaseImages: () => Promise<void>;
  handleCreateCharacter: (
    name: string,
    description: string,
    gender?: string,
    referenceImagePaths?: string[]
  ) => Promise<Character>;
  handleDeleteCharacter: (characterId: string) => Promise<void>;
  handleApproveImage: (imageId: string) => Promise<void>;
  handleDeleteImage: (imageId: string) => Promise<void>;
  // Refs for gallery page to register extra side-effects
  onAfterCreate: React.MutableRefObject<((char: Character) => Promise<void>) | null>;
  onAfterImageChange: React.MutableRefObject<(() => void) | null>;
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [baseImages, setBaseImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [charactersLoaded, setCharactersLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const onAfterCreate = useRef<((char: Character) => Promise<void>) | null>(null);
  const onAfterImageChange = useRef<(() => void) | null>(null);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? null;

  const selectCharacter = useCallback((id: string | null) => {
    setSelectedCharacterId(id);
    if (id) {
      document.cookie = `selectedCharacterId=${id};path=/;max-age=${60 * 60 * 24 * 365}`;
    } else {
      document.cookie = "selectedCharacterId=;path=/;max-age=0";
    }
  }, []);

  const refreshBaseImages = useCallback(async () => {
    if (!selectedCharacterId) {
      setBaseImages([]);
      return;
    }
    try {
      const imgs = await listCharacterImages(selectedCharacterId);
      setBaseImages(imgs.filter((img) => img.type === "base"));
    } catch {
      // ignore
    }
  }, [selectedCharacterId]);

  // Refresh base images when selected character changes
  useEffect(() => {
    refreshBaseImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharacterId]);

  const loadCharacters = useCallback(async () => {
    try {
      const data = await listCharacters();
      setCharacters(data);
      setCharactersLoaded(true);
      if (data.length === 0) {
        setShowOnboarding(true);
      } else {
        setSelectedCharacterId((prev) => {
          if (prev && data.some((c) => c.id === prev)) return prev;
          const cookieId = document.cookie.match(/selectedCharacterId=([^;]+)/)?.[1];
          const urlId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("character")
              : null;
          const restoreId = urlId || cookieId;
          const validId =
            restoreId && data.some((c) => c.id === restoreId) ? restoreId : data[0].id;
          if (validId) {
            document.cookie = `selectedCharacterId=${validId};path=/;max-age=${60 * 60 * 24 * 365}`;
          }
          return validId ?? null;
        });
      }
    } catch (err) {
      setCharactersLoaded(true);
      console.error("Failed to load characters:", err);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateCharacter = useCallback(
    async (
      name: string,
      description: string,
      gender?: string,
      referenceImagePaths?: string[]
    ): Promise<Character> => {
      setLoading(true);
      try {
        const created = await apiCreate({ name, description, gender });
        await loadCharacters();
        selectCharacter(created.id);
        if (onAfterCreate.current) await onAfterCreate.current(created);
        return created;
      } finally {
        setLoading(false);
      }
    },
    [loadCharacters, selectCharacter]
  );

  const handleDeleteCharacter = useCallback(
    async (characterId: string) => {
      setLoading(true);
      try {
        await apiDelete(characterId);
        selectCharacter(null);
        setBaseImages([]);
        await loadCharacters();
      } finally {
        setLoading(false);
      }
    },
    [loadCharacters, selectCharacter]
  );

  const handleApproveImage = useCallback(
    async (imageId: string) => {
      await apiApprove(imageId);
      await refreshBaseImages();
      onAfterImageChange.current?.();
    },
    [refreshBaseImages]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string) => {
      await apiDeleteImg(imageId);
      await refreshBaseImages();
      onAfterImageChange.current?.();
    },
    [refreshBaseImages]
  );

  return (
    <CharacterContext.Provider
      value={{
        characters,
        selectedCharacter,
        selectedCharacterId,
        baseImages,
        loading,
        charactersLoaded,
        showOnboarding,
        setShowOnboarding,
        selectCharacter,
        loadCharacters,
        refreshBaseImages,
        handleCreateCharacter,
        handleDeleteCharacter,
        handleApproveImage,
        handleDeleteImage,
        onAfterCreate,
        onAfterImageChange,
      }}
    >
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const ctx = useContext(CharacterContext);
  if (!ctx) throw new Error("useCharacter must be used within CharacterProvider");
  return ctx;
}
