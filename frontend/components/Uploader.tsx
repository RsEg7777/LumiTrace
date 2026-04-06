'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, Film, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

interface UploaderProps {
  onFileSelect: (file: File, preview: string) => void;
}

export default function Uploader({ onFileSelect }: UploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      onFileSelect(file, previewUrl);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.webm'],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-8 shadow-sm"
    >
      <div
        {...getRootProps()}
        className={`
          upload-zone rounded-xl p-12 text-center cursor-pointer
          transition-all duration-300
          ${isDragActive ? 'dragover scale-[1.02]' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <motion.div
          animate={{ y: isDragActive ? -10 : 0 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="glow flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 shadow-[0_0_20px_rgba(34,211,238,0.5)] animate-glow">
            <Upload className="h-10 w-10 text-white" />
          </div>
          
          <div>
            <p className="font-heading mb-2 text-lg font-semibold text-cyan-50 text-glow">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your file'}
            </p>
            <p className="text-sm text-cyan-200/75">
              or click to browse from your computer
            </p>
          </div>

          <div className="flex gap-4 mt-4">
            <div className="chip flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-cyan-100 hover:scale-105 transition-transform bg-dark-800/40">
              <ImageIcon className="h-4 w-4 text-cyan-400" />
              <span>Images</span>
            </div>
            <div className="chip flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-cyan-100 hover:scale-105 transition-transform bg-dark-800/40">
              <Film className="h-4 w-4 text-fuchsia-400" />
              <span>Videos</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-purple-200/70 font-mono tracking-wider">
            SUPPORTS: PNG, JPG, MP4, MOV (MAX: {formatBytes(100 * 1024 * 1024)})
          </p>
        </motion.div>
      </div>

      {fileRejections.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 flex items-start gap-3 rounded-lg border border-rose-500/50/55 bg-rose-900/40/65 p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-400" />
          <div className="text-sm text-rose-200">
            <p className="font-semibold">File rejected</p>
            <p className="text-rose-300/80">
              {fileRejections[0].errors[0].message}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
