'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface ToastProps {
  open: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

const iconByType = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const classByType = {
  success: 'border-cyan-300/60 bg-gradient-to-r from-cyan-200/75 via-blue-200/70 to-indigo-200/72 text-cyan-50 text-glow',
  error: 'border-rose-500/50 bg-gradient-to-r from-rose-200/75 via-fuchsia-200/68 to-purple-200/72 text-rose-950',
  info: 'border-purple-500/40/60 bg-gradient-to-r from-cyan-200/75 via-indigo-200/72 to-fuchsia-200/70 text-cyan-50 text-glow',
};

export default function Toast({
  open,
  message,
  type = 'info',
  onClose,
}: ToastProps) {
  const Icon = iconByType[type];

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      onClose();
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className={`fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl border px-4 py-3 shadow-[0_16px_40px_rgba(67,95,216,0.3)] backdrop-blur ${classByType[type]}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5" />
            <div className="flex-1 text-sm font-medium">{message}</div>
            <button
              onClick={onClose}
              className="rounded px-1 py-0.5 text-xs opacity-80 hover:opacity-100"
              aria-label="Close notification"
            >
              Close
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
