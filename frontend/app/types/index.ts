export interface RenderSettings {
  samples: number;
  maxBounces: number;
  useDenoising: boolean;
  useNeural: boolean;
  exposure: number;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  output_url?: string;
  media_type?: 'image' | 'video';
  queue_position?: number | null;
}

export interface ProcessResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface JobSummary {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  media_type: 'image' | 'video';
  input_filename?: string;
  samples: number;
  max_bounces: number;
  use_denoising: boolean;
  use_neural: boolean;
  exposure: number;
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  display_name: string;
}

export interface GoogleLoginRequest {
  id_token: string;
}

export interface ModelInfo {
  name: string;
  description: string;
  version: string;
  device: string;
}

export interface ApiError {
  status: number;
  message: string;
}

export interface HistoryItem {
  id: string;
  name: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  settings: RenderSettings;
}