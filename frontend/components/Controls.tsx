'use client';

import { motion } from 'framer-motion';
import { Play, RotateCcw, Settings2, Cpu, Sparkles, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RenderSettings } from '@/app/types';
import PresetsPanel from './PresetsPanel';

interface ControlsProps {
  settings: RenderSettings;
  onSettingsChange: (settings: RenderSettings) => void;
  onProcess: () => void;
  onCancel?: () => void;
  isProcessing: boolean;
  onReset: () => void;
}

export default function Controls({
  settings,
  onSettingsChange,
  onProcess,
  onCancel,
  isProcessing,
  onReset,
}: ControlsProps) {
  const updateSetting = <K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const estimatedSeconds = Math.max(
    4,
    Math.round((settings.samples / 32) * (settings.maxBounces / 2) * (settings.useNeural ? 0.4 : 1)),
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-strong rounded-[2rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/10 blur-[50px] rounded-full pointer-events-none"></div>
      
      <div className="flex items-center gap-3 border-b border-purple-500/20 pb-4">
        <Settings2 className="h-5 w-5 text-cyan-400 animate-pulse-slow" />
        <div>
          <h3 className="font-heading font-semibold text-cyan-50 text-glow">Render Settings</h3>
          <p className="text-xs text-purple-200">Estimated time ~{estimatedSeconds}s</p>
        </div>
      </div>

      <PresetsPanel onApplyPreset={onSettingsChange} />

      <div className="space-y-4">
        <label className="text-sm font-medium text-pink-200 tracking-wide uppercase">Rendering Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => updateSetting('useNeural', false)}
            className={cn(
              'flex flex-col items-center justify-center gap-3 p-4 rounded-xl transition-all duration-300',
              !settings.useNeural
                ? 'btn-glow border-cyan-400 bg-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                : 'glass border-white/5 hover:border-pink-400/50 hover:bg-white/5'
            )}
          >
            <Sparkles className={cn("w-5 h-5", !settings.useNeural ? "text-white" : "text-cyan-400")} />
            <span className={cn("text-xs font-semibold", !settings.useNeural ? "text-white" : "text-cyan-200")}>Path Tracing</span>
          </button>
          
          <button
            onClick={() => updateSetting('useNeural', true)}
            className={cn(
              'flex flex-col items-center justify-center gap-3 p-4 rounded-xl transition-all duration-300',
              settings.useNeural
                ? 'bg-gradient-to-br from-fuchsia-500 to-purple-600 border border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.5)]'
                : 'glass border-white/5 hover:border-cyan-400/50 hover:bg-white/5'
            )}
          >
            <Cpu className={cn("w-5 h-5", settings.useNeural ? "text-white" : "text-fuchsia-400")} />
            <span className={cn("text-xs font-semibold", settings.useNeural ? "text-white" : "text-fuchsia-200")}>Neural Fast</span>
          </button>
        </div>
      </div>

      {!settings.useNeural && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center bg-dark-800/50 rounded-lg p-3 border border-white/5">
            <span className="text-sm font-medium text-cyan-100">Samples</span>
            <span className="font-mono text-cyan-400 font-bold bg-cyan-400/10 px-3 py-1 rounded text-glow">{settings.samples}</span>
          </div>
          <input
            type="range"
            min="16"
            max="512"
            step="16"
            value={settings.samples}
            onChange={(e) => updateSetting('samples', parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3 bg-dark-800/30 rounded-xl p-4 border border-white/5">
          <div className="flex justify-between text-xs font-semibold text-purple-200">
            <span>Bounces</span>
            <span className="text-purple-400">{settings.maxBounces}</span>
          </div>
          <input
            type="range"
            min="1"
            max="16"
            step="1"
            value={settings.maxBounces}
            onChange={(e) => updateSetting('maxBounces', parseInt(e.target.value))}
            className="w-full accent-purple-400 cursor-pointer"
          />
        </div>
        
        <div className="space-y-3 bg-dark-800/30 rounded-xl p-4 border border-white/5">
          <div className="flex justify-between text-xs font-semibold text-pink-200">
            <span>Exposure</span>
            <span className="text-pink-400">{settings.exposure.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={settings.exposure}
            onChange={(e) => updateSetting('exposure', parseFloat(e.target.value))}
            className="w-full accent-pink-400 cursor-pointer"
          />
        </div>
      </div>

      <label className="glass flex cursor-pointer items-center justify-between rounded-xl border border-white/10 p-4 transition-all hover:border-cyan-400/50 hover:bg-white/5 group">
        <span className="text-sm font-semibold text-cyan-50 group-hover:text-cyan-200 transition-colors">AI Denoising</span>
        <div className={cn(
          "w-12 h-6 rounded-full p-1 transition-colors duration-300 relative",
          settings.useDenoising ? "bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-dark-700"
        )}>
          <div className={cn(
            "w-4 h-4 bg-white rounded-full transition-transform duration-300",
            settings.useDenoising ? "translate-x-6" : "translate-x-0"
          )} />
        </div>
      </label>

      <div className="space-y-3 pt-4 border-t border-purple-500/20">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={cn(
            'w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold tracking-wide uppercase transition-all duration-300',
            isProcessing
              ? 'cursor-not-allowed bg-dark-700 text-gray-500 border border-gray-600'
              : 'btn-glow'
          )}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-500 border-t-cyan-400 rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Render</span>
            </>
          )}
        </button>

        {isProcessing && onCancel && (
          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-pink-500/50 bg-pink-500/10 px-6 py-3 font-semibold text-pink-300 transition-all hover:bg-pink-500/20 hover:shadow-[0_0_15px_rgba(244,114,182,0.3)]"
          >
            <Square className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        )}

        <button
          onClick={onReset}
          disabled={isProcessing}
          className="w-full glass flex items-center justify-center gap-2 rounded-xl border border-white/5 px-6 py-3 font-semibold text-purple-300 transition-all hover:border-purple-400/50 hover:bg-purple-400/10 hover:text-cyan-50"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>
    </motion.div>
  );
}
