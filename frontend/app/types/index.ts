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
  }
  
  export interface ProcessResponse {
    job_id: string;
    status: string;
    message: string;
  }
  
  export interface ModelInfo {
    name: string;
    description: string;
    version: string;
    device: string;
  }