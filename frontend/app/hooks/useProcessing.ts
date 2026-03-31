'use client';

import { useState, useCallback } from 'react';
import { ProcessResponse, JobStatus } from '../types';

export function useProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (
    file: File,
    settings: any,
    onComplete: (url: string) => void
  ) => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      Object.entries(settings).forEach(([key, value]) => {
        formData.append(key, String(value));
      });

      const endpoint = file.type.startsWith('video/') 
        ? '/api/process/video' 
        : '/api/process/image';

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ProcessResponse = await response.json();
      
      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${data.job_id}`);
          const status: JobStatus = await statusRes.json();
          
          setProgress(status.progress || 0);
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            const downloadRes = await fetch(`/api/download/${data.job_id}`);
            const blob = await downloadRes.blob();
            const url = URL.createObjectURL(blob);
            onComplete(url);
            setIsProcessing(false);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setError(status.error || 'Processing failed');
            setIsProcessing(false);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setError('Failed to check status');
          setIsProcessing(false);
        }
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsProcessing(false);
    }
  }, []);

  return { isProcessing, progress, error, processFile };
}