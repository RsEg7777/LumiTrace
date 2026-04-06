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
        className="glass-strong flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-12 text-center shadow-sm"
      >
        <div className="glow mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/70 via-blue-400/70 to-fuchsia-400/70">
          <ImageIcon className="h-12 w-12 text-cyan-50 text-glow" />
        </div>
        <h3 className="font-heading mb-2 text-xl font-semibold text-cyan-50 text-glow">No Preview Available</h3>
        <p className="text-purple-200/75">Upload an image or video to get started</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-strong glow overflow-hidden rounded-2xl shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-cyan-500/30 p-4">
        <h3 className="font-heading font-semibold text-cyan-50 text-glow">Preview</h3>
        <div className="flex items-center gap-2">
          {processed && (
            <a
              href={processed}
              download
              className="btn-glow flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </a>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="glass rounded-lg p-2 text-cyan-100 transition hover:border-purple-500/40"
            aria-label="Toggle fullscreen preview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={`relative bg-indigo-950/90 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
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
              <div className="absolute left-4 top-4 rounded-full border border-white/35 bg-indigo-950/65 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                Original
              </div>
              <div className="absolute right-4 top-4 rounded-full border border-cyan-300/55 bg-gradient-to-r from-cyan-500/70 via-blue-500/65 to-fuchsia-500/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
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
                <div className="absolute inset-0 flex items-center justify-center bg-indigo-950/72 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="processing-ring mx-auto mb-4 h-16 w-16 rounded-full border-4 border-fuchsia-300/35 border-t-cyan-300 shadow-[0_0_48px_rgba(74,222,255,0.45)]" />
                    <p className="text-lg font-medium text-white">Processing...</p>
                    <p className="text-sm text-indigo-100/80">This may take a few moments</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute right-4 top-4 rounded-lg border border-white/35 bg-indigo-950/70 p-2 text-white transition hover:bg-indigo-900"
            aria-label="Exit fullscreen preview"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
