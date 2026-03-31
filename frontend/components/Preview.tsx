'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { Download, Maximize2, Image as ImageIcon } from 'lucide-react';

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
        className="glass rounded-2xl p-12 flex flex-col items-center justify-center min-h-[400px] text-center"
      >
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-6">
          <ImageIcon className="w-12 h-12 text-gray-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-400 mb-2">No Preview Available</h3>
        <p className="text-gray-500">Upload an image or video to get started</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold">Preview</h3>
        <div className="flex items-center gap-2">
          {processed && (
            <a
              href={processed}
              download
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </a>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={`relative bg-black/50 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
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
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/50 text-xs font-medium">
                Original
              </div>
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-indigo-500/50 text-xs font-medium">
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
              <img
                src={original}
                alt="Original"
                className="max-w-full max-h-full object-contain"
              />
              
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full processing-ring mx-auto mb-4" />
                    <p className="text-lg font-medium">Processing...</p>
                    <p className="text-sm text-gray-400">This may take a few moments</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 transition-colors"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}