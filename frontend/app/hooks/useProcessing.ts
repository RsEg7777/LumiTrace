'use client';

import { useCallback, useRef, useState } from 'react';

import { ApiError, JobStatus, RenderSettings } from '../types';
import {
  downloadJobResult,
  getJobStatus,
  startProcessingJob,
} from '@/lib/api';

const MAX_POLL_ATTEMPTS = 180;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5000;

async function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildWebSocketUrl(jobId: string, token?: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const websocketBaseUrl = apiBaseUrl.replace(/^http/i, 'ws').replace(/\/$/, '');
  const authQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${websocketBaseUrl}/ws/jobs/${jobId}${authQuery}`;
}

export function useProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);

  const closeSocket = useCallback(() => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.close();
    socketRef.current = null;
  }, []);

  const processFile = useCallback(
    async (
      file: File,
      settings: RenderSettings,
      token: string | undefined,
      onComplete: (url: string, jobId: string) => void,
    ) => {
      setIsProcessing(true);
      setProgress(0);
      setError(null);
      cancelRef.current = false;

      try {
        const processResponse = await startProcessingJob(file, settings, token);
        activeJobRef.current = processResponse.job_id;
        const websocketTerminalStatusRef: { current: JobStatus | null } = { current: null };

        const websocketUrl = buildWebSocketUrl(processResponse.job_id, token);
        if (websocketUrl) {
          try {
            const socket = new WebSocket(websocketUrl);
            socketRef.current = socket;

            socket.onmessage = (event: MessageEvent<string>) => {
              try {
                const payload = JSON.parse(event.data) as JobStatus;
                if (typeof payload.progress === 'number') {
                  setProgress(payload.progress);
                }

                if (payload.status === 'completed' || payload.status === 'failed') {
                  websocketTerminalStatusRef.current = payload;
                }
              } catch {
                // Ignore malformed websocket payloads and let polling continue.
              }
            };
          } catch {
            socketRef.current = null;
          }
        }

        let backoff = INITIAL_BACKOFF_MS;

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          if (cancelRef.current) {
            throw new Error('Processing was canceled');
          }

          if (websocketTerminalStatusRef.current?.status === 'completed') {
            const blob = await downloadJobResult(processResponse.job_id, token);
            const url = URL.createObjectURL(blob);
            onComplete(url, processResponse.job_id);
            setIsProcessing(false);
            activeJobRef.current = null;
            closeSocket();
            return;
          }

          if (websocketTerminalStatusRef.current?.status === 'failed') {
            throw new Error(websocketTerminalStatusRef.current.error || 'Processing failed');
          }

          const status = await getJobStatus(processResponse.job_id, token);
          setProgress(status.progress || 0);

          if (status.status === 'completed') {
            const blob = await downloadJobResult(processResponse.job_id, token);
            const url = URL.createObjectURL(blob);
            onComplete(url, processResponse.job_id);
            setIsProcessing(false);
            activeJobRef.current = null;
            closeSocket();
            return;
          }

          if (status.status === 'failed') {
            throw new Error(status.error || 'Processing failed');
          }

          await sleep(backoff);
          backoff = Math.min(Math.floor(backoff * 1.2), MAX_BACKOFF_MS);
        }

        throw new Error('Job timed out while waiting for completion');
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError.message || 'Unknown error');
        setIsProcessing(false);
        activeJobRef.current = null;
        closeSocket();
      }
    },
    [closeSocket],
  );

  const cancelProcessing = useCallback(() => {
    cancelRef.current = true;
    setIsProcessing(false);
    setError('Processing canceled by user');
    closeSocket();
  }, [closeSocket]);

  return {
    isProcessing,
    progress,
    error,
    processFile,
    cancelProcessing,
    activeJobId: activeJobRef.current,
  };
}