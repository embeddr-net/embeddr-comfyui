export interface PromptImageRead {
  id: number;
  prompt: string;
  image_url: string;
  thumb_url?: string;
  model?: string;
  created_at: string;
  author_name?: string;
  like_count: number;
  liked_by_me: boolean;
  // Local specific
  filename?: string;
  path?: string;
  width?: number;
  height?: number;
}

export interface LibraryPath {
  id: number;
  path: string;
  name: string | null;
  image_count: number;
}

export type ApiMode = "local";
