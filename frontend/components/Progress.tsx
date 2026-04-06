'use client';

import { motion } from 'framer-motion';
import { Clock, CheckCircle2 } from 'lucide-react';

interface ProgressProps {
  progress: number;
}

export default function Progress({ progress }: ProgressProps) {
  const getStage = (p: number) => {
    if (p < 20) return { label: 'Queued and uploading', color: 'from-cyan-500 via-blue-500 to-indigo-500' };
    if (p < 40) return { label: 'Estimating depth', color: 'from-cyan-500 via-blue-500 to-purple-500' };
    if (p < 70) return { label: 'Tracing light paths', color: 'from-blue-500 via-indigo-500 to-fuchsia-500' };
    if (p < 90) return { label: 'Denoising output', color: 'from-fuchsia-500 via-purple-500 to-cyan-500' };
    return { label: 'Finalizing render', color: 'from-cyan-400 via-blue-500 to-fuchsia-500' };
  };

  const stage = getStage(progress);
  const isComplete = progress >= 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-pink-200" />
          ) : (
            <Clock className="h-5 w-5 text-cyan-700" />
          )}
          <span className="font-heading font-semibold text-cyan-50 text-glow">{isComplete ? 'Complete!' : stage.label}</span>
        </div>
        <span className="text-sm font-medium text-purple-200">{Math.round(progress)}%</span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-indigo-200/55">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${stage.color}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Shimmer effect */}
        {!isComplete && (
          <motion.div
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      <div className="mt-2 flex justify-between text-xs text-pink-200/70">
        <span>Upload</span>
        <span>Depth</span>
        <span>Render</span>
        <span>Denoise</span>
        <span>Done</span>
      </div>
    </motion.div>
  );
}
