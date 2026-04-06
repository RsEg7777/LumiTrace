'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Download, Maximize2, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

interface PreviewProps {
  original: string | null;
  processed: string | null;
  isProcessing: boolean;
}

export default function Preview({ original, processed, isProcessing }: PreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!original) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl border border-white/10 bg-transparent/90 p-12 flex flex-col items-center justify-center min-h-[420px] text-center shadow-sm"
      >
        <div className="w-24 h-24 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center mb-6">
          <ImageIcon className="w-12 h-12 text-zinc-400" />
        </div>
        <h3 className="text-xl font-semibold text-teal-300 mb-2">No Preview Available</h3>
        <p className="text-zinc-400">Upload an image or video to get started</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl overflow-hidden border border-white/10 glass-strong shadow-sm"
    >
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-50">Preview</h3>
        <div className="flex items-center gap-2">
          {processed && (
            <a
              href={processed}
              download
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg btn-primary text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </a>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
            aria-label="Toggle fullscreen preview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={`relative bg-slate-900/90 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
        <AnimatePresence mode="wait">
          {processed ? (
            <motion.div
              key="comparison"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <ReactCompareSlider
                itemOne={
                  <ReactCompareSliderImage
                    src={original}
                    alt="Original"
                    style={{ objectFit: 'contain' }}
                  />
                }
                itemTwo={
                  <ReactCompareSliderImage
                    src={processed}
                    alt="Path Traced"
                    style={{ objectFit: 'contain' }}
                  />
                }
                style={{ height: isFullscreen ? '100vh' : '500px' }}
                position={50}
              />
              
              {/* Labels */}
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-slate-900/70 text-xs font-medium text-white">
                Original
              </div>
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-cyan-500/60 text-xs font-medium text-white">
                Path Traced
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="original"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative flex items-center justify-center"
              style={{ height: isFullscreen ? '100vh' : '500px' }}
            >
              <Image
                src={original}
                alt="Original"
                fill
                className="object-contain"
                unoptimized
              />
              
              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full processing-ring mx-auto mb-4" />
                    <p className="text-lg font-medium text-white">Processing...</p>
                    <p className="text-sm text-slate-300">This may take a few moments</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900 transition-colors"
            aria-label="Exit fullscreen preview"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
