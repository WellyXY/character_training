export type CharacterStatus = "draft" | "active" | "archived";

export interface CharacterProfile {
  facial?: Record<string, unknown>;
  body?: Record<string, unknown>;
  style?: string;
  aura?: string;
  age_appearance?: string;
  gender?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  gender?: string | null;
  profile?: CharacterProfile | null;
  canonical_prompt_block?: string | null;
  base_image_ids: string[];
  status: CharacterStatus;
  created_at: string;
  updated_at: string;
}

export type ImageType = "base" | "scene" | "reference_output" | "content";
export type ImageStatus = "generating" | "completed" | "failed";
export type AspectRatio = "9:16" | "1:1" | "16:9";

// Content generation types
export type ContentType = "daily_vlog" | "dance" | "lipsync" | "daily_story_photo";
export type Style = "sexy" | "exposed" | "erotic" | "home" | "warm" | "cute";
export type Cloth = "autumn_winter" | "sports" | "sexy_lingerie" | "sexy_underwear" | "nude" | "home_wear" | "daily" | "fashion";
export type ContentFormat = "image" | "video";
export type VideoModel = "image-to-video-v2" | "audio-to-video";
export type VideoType = "dance" | "lipsync" | "vlog";

export interface ImageMetadata {
  prompt?: string;
  negative_prompt?: string;
  seed?: number | null;
  steps?: number;
  guidance_scale?: number;
  width?: number;
  height?: number;
  reference_image_ids?: string[];
  user_reference_path?: string;
  style?: string;
  cloth?: string;
}

export interface Image {
  id: string;
  character_id: string;
  type: ImageType;
  status: ImageStatus;
  image_url?: string | null;  // Nullable for generating state
  task_id?: string | null;
  pose?: string | null;
  expression?: string | null;
  metadata: ImageMetadata;
  consistency_score?: number | null;
  is_approved: boolean;
  error_message?: string | null;
  created_at: string;
}

export interface UploadResponse {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  full_url: string;
  created_at: string;
}

// Video types
export interface VideoMetadata {
  prompt?: string;
  style?: string;
  cloth?: string;
  content_type?: string;
  source_image_id?: string;
  audio_url?: string;
  music_url?: string;
  video_model?: string;
  resolution?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export type VideoStatus = "pending" | "processing" | "completed" | "failed";

export interface Video {
  id: string;
  character_id: string;
  type: VideoType;
  video_url: string;
  thumbnail_url?: string | null;
  duration?: number | null;
  metadata: VideoMetadata;
  status: VideoStatus;
  created_at: string;
}

// Agent types
export type ConversationState = "idle" | "understanding" | "planning" | "awaiting_confirmation" | "executing";

// Reference Image Mode for controlling how reference images are used
export type ReferenceImageMode = "face_swap" | "pose_background" | "clothing_pose" | "custom";

export interface PendingGenerationParams {
  content_type?: string;
  style?: string;
  cloth?: string;
  scene_description?: string;
  aspect_ratio?: string;
  reference_image_path?: string;
  reference_image_mode?: ReferenceImageMode;
}

export interface PendingGeneration {
  skill: string;
  params: PendingGenerationParams;
  optimized_prompt: string;
  reasoning: string;
  suggestions: string[];
}

// Image Edit types
export type EditType = "add" | "remove" | "replace" | "modify" | "style" | "background" | "outfit";

export interface PendingEditParams {
  source_image_path: string;
  edit_type?: EditType;
  edit_instruction: string;
  additional_reference_path?: string;
}

export interface PendingEdit {
  skill: string;
  params: PendingEditParams;
  optimized_prompt: string;
  reasoning: string;
  suggestions: string[];
}

export interface AgentChatRequest {
  message: string;
  character_id?: string | null;
  session_id?: string | null;
  reference_image_path?: string | null;
  reference_image_mode?: ReferenceImageMode | null;
}

// Generation Task types for background generation
export type GenerationTaskStatus = "pending" | "generating" | "completed" | "failed";

export interface GenerationTask {
  task_id: string;
  status: GenerationTaskStatus;
  progress: number;
  stage: string;
  prompt: string;
  reference_image_url?: string | null;
  result_url?: string | null;
  error?: string | null;
  created_at: string;
}

export interface AgentChatResponse {
  message: string;
  session_id: string;
  state: ConversationState;
  pending_generation?: PendingGeneration | null;
  pending_edit?: PendingEdit | null;
  action_taken?: string | null;
  result?: Record<string, unknown> | null;
  active_task?: GenerationTask | null;
}

export interface AgentConfirmRequest {
  session_id: string;
  aspect_ratio: string;
  modifications?: string | null;
  edited_prompt?: string | null;
  character_id?: string | null;
  pending_generation?: PendingGeneration | null;
}

// Image Edit API types
export interface ImageEditRequest {
  message: string;
  source_image_path: string;
  character_id?: string | null;
  session_id?: string | null;
}

export interface ImageEditConfirmRequest {
  session_id: string;
  aspect_ratio: string;
  edited_prompt?: string | null;
  character_id?: string | null;
  pending_edit?: PendingEdit | null;
}

// Sample Gallery types
export type SampleMediaType = "image" | "video";

export interface SamplePost {
  id: string;
  creator_name: string;
  source_url: string;
  media_type: SampleMediaType;
  media_url: string;
  thumbnail_url: string;
  caption?: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SampleListParams {
  tag?: string;
  creator?: string;
  media_type?: SampleMediaType;
  limit?: number;
  offset?: number;
}
