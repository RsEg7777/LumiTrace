'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, Film, AlertCircle } from 'lucide-react';

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
      className="glass rounded-2xl p-8"
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
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
            <Upload className="w-10 h-10 text-indigo-400" />
          </div>
          
          <div>
            <p className="text-lg font-semibold mb-2">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your file'}
            </p>
            <p className="text-sm text-gray-400">
              or click to browse from your computer
            </p>
          </div>

          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-xs">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
              <span>Images</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-xs">
              <Film className="w-4 h-4 text-purple-400" />
              <span>Videos</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Supports PNG, JPG, MP4, MOV up to 100MB
          </p>
        </motion.div>
      </div>

      {fileRejections.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-200">
            <p className="font-medium">File rejected</p>
            <p className="text-red-300/80">
              {fileRejections[0].errors[0].message}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}