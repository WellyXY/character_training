import type {
  Character,
  CharacterStatus,
  Image,
  ImageType,
  Video,
  UploadResponse,
  AgentChatRequest,
  AgentChatResponse,
  AgentConfirmRequest,
  ImageEditRequest,
  ImageEditConfirmRequest,
  SamplePost,
  SampleListParams,
  GenerationTask,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const API_ROOT = `${API_BASE}/api/v1`;

export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

// Character endpoints
export async function listCharacters(): Promise<Character[]> {
  return apiFetch<Character[]>("/characters");
}

export async function createCharacter(data: {
  name: string;
  description: string;
  gender?: string;
}): Promise<Character> {
  return apiFetch<Character>("/characters", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCharacter(id: string): Promise<Character> {
  return apiFetch<Character>(`/characters/${id}`);
}

export async function updateCharacter(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: CharacterStatus;
  }
): Promise<Character> {
  return apiFetch<Character>(`/characters/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCharacter(id: string): Promise<void> {
  await apiFetch<void>(`/characters/${id}`, { method: "DELETE" });
}

// Image endpoints
export async function listCharacterImages(
  characterId: string,
  imageType?: ImageType
): Promise<Image[]> {
  const typeParam = imageType ? `?image_type=${imageType}` : "";
  return apiFetch<Image[]>(`/characters/${characterId}/images${typeParam}`);
}

export async function approveImage(imageId: string): Promise<Image> {
  return apiFetch<Image>(`/images/${imageId}/approve`, { method: "POST" });
}

export async function deleteImage(imageId: string): Promise<void> {
  await apiFetch<void>(`/images/${imageId}`, { method: "DELETE" });
}

export async function retryImage(imageId: string): Promise<Image> {
  return apiFetch<Image>(`/images/${imageId}/retry`, { method: "POST" });
}

// Video endpoints
export async function listCharacterVideos(characterId: string): Promise<Video[]> {
  return apiFetch<Video[]>(`/characters/${characterId}/videos`);
}

export async function deleteVideo(videoId: string): Promise<void> {
  await apiFetch<void>(`/videos/${videoId}`, { method: "DELETE" });
}

export async function retryVideo(videoId: string): Promise<Video> {
  return apiFetch<Video>(`/videos/${videoId}/retry`, { method: "POST" });
}

// Upload endpoint
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_ROOT}/uploads`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Upload failed (${res.status})`);
  }

  return (await res.json()) as UploadResponse;
}

// Direct generation (bypasses AI agent)
export async function generateDirect(request: {
  character_id: string;
  prompt: string;
  aspect_ratio?: string;
}): Promise<import("./types").Image> {
  return apiFetch<import("./types").Image>("/generate/direct", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// Agent endpoints
export async function agentChat(request: AgentChatRequest): Promise<AgentChatResponse> {
  return apiFetch<AgentChatResponse>("/agent/chat", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function agentConfirm(request: AgentConfirmRequest): Promise<AgentChatResponse> {
  return apiFetch<AgentChatResponse>("/agent/confirm", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function agentCancel(sessionId: string): Promise<void> {
  await apiFetch<void>(`/agent/cancel?session_id=${sessionId}`, { method: "POST" });
}

export async function agentClear(sessionId: string): Promise<void> {
  await apiFetch<void>(`/agent/clear?session_id=${sessionId}`, { method: "POST" });
}

export async function getGenerationTask(
  sessionId: string,
  taskId: string
): Promise<GenerationTask> {
  return apiFetch<GenerationTask>(
    `/agent/tasks/${taskId}?session_id=${sessionId}`
  );
}

// Animate endpoints
export interface AnalyzeImageResponse {
  suggested_prompt: string;
  image_analysis: string;
  suggested_motion_types: string[];
}

export async function analyzeImageForAnimation(request: {
  image_id: string;
  image_url: string;
}): Promise<AnalyzeImageResponse> {
  return apiFetch<AnalyzeImageResponse>("/animate/analyze", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export interface AnimateImageResponse {
  success: boolean;
  video_id?: string;
  video_url?: string;
  message: string;
}

export async function animateImage(request: {
  image_id: string;
  image_url: string;
  character_id: string;
  prompt: string;
}): Promise<AnimateImageResponse> {
  return apiFetch<AnimateImageResponse>("/animate/generate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// Image Edit endpoints
export async function imageEditChat(request: ImageEditRequest): Promise<AgentChatResponse> {
  return apiFetch<AgentChatResponse>("/agent/image-edit", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function imageEditConfirm(request: ImageEditConfirmRequest): Promise<AgentChatResponse> {
  return apiFetch<AgentChatResponse>("/agent/image-edit/confirm", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// Sample Gallery endpoints
export async function listSamples(params?: SampleListParams): Promise<SamplePost[]> {
  const searchParams = new URLSearchParams();
  if (params?.tag) searchParams.append("tag", params.tag);
  if (params?.creator) searchParams.append("creator", params.creator);
  if (params?.media_type) searchParams.append("media_type", params.media_type);
  if (params?.limit) searchParams.append("limit", params.limit.toString());
  if (params?.offset) searchParams.append("offset", params.offset.toString());

  const queryString = searchParams.toString();
  const path = queryString ? `/samples?${queryString}` : "/samples";
  return apiFetch<SamplePost[]>(path);
}

export async function getSample(id: string): Promise<SamplePost> {
  return apiFetch<SamplePost>(`/samples/${id}`);
}

export async function uploadSample(
  file: File,
  creatorName?: string,
  tags?: string
): Promise<SamplePost> {
  const formData = new FormData();
  formData.append("file", file);
  if (creatorName) formData.append("creator_name", creatorName);
  if (tags) formData.append("tags", tags);

  const res = await fetch(`${API_ROOT}/samples/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Upload failed (${res.status})`);
  }

  return (await res.json()) as SamplePost;
}

export async function importSampleFromUrl(
  url: string,
  tags?: string
): Promise<SamplePost> {
  const formData = new FormData();
  formData.append("url", url);
  if (tags) formData.append("tags", tags);

  const res = await fetch(`${API_ROOT}/samples/import-url`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Import failed (${res.status})`);
  }

  return (await res.json()) as SamplePost;
}

export async function deleteSample(id: string): Promise<void> {
  await apiFetch<void>(`/samples/${id}`, { method: "DELETE" });
}

export async function updateSample(
  id: string,
  data: { tags?: string[]; creator_name?: string; caption?: string }
): Promise<SamplePost> {
  return apiFetch<SamplePost>(`/samples/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
