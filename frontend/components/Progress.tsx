'use client';

import { motion } from 'framer-motion';
import { Clock, CheckCircle2 } from 'lucide-react';

interface ProgressProps {
  progress: number;
}

export default function Progress({ progress }: ProgressProps) {
  const getStage = (p: number) => {
    if (p < 20) return { label: 'Uploading...', color: 'bg-blue-500' };
    if (p < 40) return { label: 'Estimating Depth...', color: 'bg-purple-500' };
    if (p < 70) return { label: 'Path Tracing...', color: 'bg-indigo-500' };
    if (p < 90) return { label: 'Denoising...', color: 'bg-pink-500' };
    return { label: 'Finalizing...', color: 'bg-green-500' };
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
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <Clock className="w-5 h-5 text-indigo-400" />
          )}
          <span className="font-medium">{isComplete ? 'Complete!' : stage.label}</span>
        </div>
        <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
      </div>

      <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${stage.color}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Shimmer effect */}
        {!isComplete && (
          <motion.div
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>Upload</span>
        <span>Depth</span>
        <span>Render</span>
        <span>Denoise</span>
        <span>Done</span>
      </div>
    </motion.div>
  );
}