'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, Image as ImageIcon, Film, Github, Cpu } from 'lucide-react';
import Uploader from './components/Uploader';
import Preview from './components/Preview';
import Controls from './components/Controls';
import Progress from './components/Progress';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [settings, setSettings] = useState({
    samples: 64,
    maxBounces: 4,
    useDenoising: true,
    useNeural: false,
    exposure: 1.0,
  });

  const handleFileSelect = (selectedFile: File, previewUrl: string) => {
    setFile(selectedFile);
    setPreview(previewUrl);
    setResult(null);
  };

  const handleProcess = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('samples', settings.samples.toString());
    formData.append('max_bounces', settings.maxBounces.toString());
    formData.append('use_denoising', settings.useDenoising.toString());
    formData.append('use_neural', settings.useNeural.toString());
    formData.append('exposure', settings.exposure.toString());

    try {
      const endpoint = file.type.startsWith('video/') ? '/api/process/video' : '/api/process/image';
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.job_id) {
        // Poll for progress
        const interval = setInterval(async () => {
          const statusRes = await fetch(`/api/status/${data.job_id}`);
          const status = await statusRes.json();
          
          setProgress(status.progress || 0);
          
          if (status.status === 'completed') {
            clearInterval(interval);
            const downloadRes = await fetch(`/api/download/${data.job_id}`);
            const blob = await downloadRes.blob();
            const url = URL.createObjectURL(blob);
            setResult(url);
            setIsProcessing(false);
          } else if (status.status === 'failed') {
            clearInterval(interval);
            setIsProcessing(false);
            alert('Processing failed: ' + status.error);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error:', error);
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass-strong border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center glow">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-glow">LumiTrace</span>
          </div>
          
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/RsEg7777/LumiTrace"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-colors"
            >
              <Github className="w-5 h-5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI-Powered
              </span>
              <br />
              Path Tracing
            </h1>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Transform your images and videos with physically accurate lighting,
              global illumination, and cinematic quality rendering.
            </p>
          </motion.div>

          {/* Feature Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-wrap justify-center gap-3 mb-12"
          >
            {[
              { icon: Cpu, text: 'RTX 5070 Optimized' },
              { icon: Zap, text: 'Real-time Preview' },
              { icon: ImageIcon, text: '4K Support' },
              { icon: Film, text: 'Video Processing' },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-4 py-2 rounded-full glass text-sm"
              >
                <feature.icon className="w-4 h-4 text-indigo-400" />
                <span>{feature.text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Main Interface */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Panel - Upload & Controls */}
            <div className="lg:col-span-1 space-y-6">
              <AnimatePresence mode="wait">
                {!file ? (
                  <motion.div
                    key="uploader"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Uploader onFileSelect={handleFileSelect} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="controls"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <Controls
                      settings={settings}
                      onSettingsChange={setSettings}
                      onProcess={handleProcess}
                      isProcessing={isProcessing}
                      onReset={() => {
                        setFile(null);
                        setPreview(null);
                        setResult(null);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Panel - Preview */}
            <div className="lg:col-span-2">
              <Preview
                original={preview}
                processed={result}
                isProcessing={isProcessing}
              />
              
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <Progress progress={progress} />
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm">
          <p>Powered by RTX 5070 • Built with Next.js & FastAPI</p>
        </div>
      </footer>
    </main>
  );
}