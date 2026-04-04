import {
  ApiError,
  AuthResponse,
  GoogleLoginRequest,
  JobStatus,
  JobSummary,
  LoginRequest,
  ProcessResponse,
  RegisterRequest,
  RenderSettings,
  User,
} from '@/app/types';

function makeHeaders(token?: string): HeadersInit {
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = 'Unexpected API error';
    try {
      const payload = await response.json();
      message = payload.detail || payload.error || payload.message || message;
    } catch {
      message = response.statusText || message;
    }

    const apiError: ApiError = {
      status: response.status,
      message,
    };
    throw apiError;
  }

  return response.json() as Promise<T>;
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<AuthResponse>(response);
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<AuthResponse>(response);
}

export async function fetchMe(token: string): Promise<User> {
  const response = await fetch('/api/auth/me', {
    headers: makeHeaders(token),
  });

  return parseResponse<User>(response);
}

export async function googleLogin(payload: GoogleLoginRequest): Promise<AuthResponse> {
  const response = await fetch('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<AuthResponse>(response);
}

export async function startProcessingJob(
  file: File,
  settings: RenderSettings,
  token?: string,
): Promise<ProcessResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('samples', String(settings.samples));
  formData.append('max_bounces', String(settings.maxBounces));
  formData.append('use_denoising', String(settings.useDenoising));
  formData.append('use_neural', String(settings.useNeural));
  formData.append('exposure', String(settings.exposure));

  const endpoint = file.type.startsWith('video/') ? '/api/process/video' : '/api/process/image';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: makeHeaders(token),
    body: formData,
  });

  return parseResponse<ProcessResponse>(response);
}

export async function getJobStatus(jobId: string, token?: string): Promise<JobStatus> {
  const response = await fetch(`/api/status/${jobId}`, {
    headers: makeHeaders(token),
  });

  return parseResponse<JobStatus>(response);
}

export async function downloadJobResult(jobId: string, token?: string): Promise<Blob> {
  const response = await fetch(`/api/download/${jobId}`, {
    headers: makeHeaders(token),
  });

  if (!response.ok) {
    let message = 'Unable to download result';
    try {
      const payload = await response.json();
      message = payload.detail || payload.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw {
      status: response.status,
      message,
    } as ApiError;
  }

  return response.blob();
}

export async function listJobs(token: string, limit = 20): Promise<JobSummary[]> {
  const response = await fetch(`/api/jobs?limit=${limit}`, {
    headers: makeHeaders(token),
  });

  return parseResponse<JobSummary[]>(response);
}
