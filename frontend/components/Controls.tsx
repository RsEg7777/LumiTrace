'use client';

import { motion } from 'framer-motion';
import { Play, RotateCcw, Settings2, Cpu, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ControlsProps {
  settings: {
    samples: number;
    maxBounces: number;
    useDenoising: boolean;
    useNeural: boolean;
    exposure: number;
  };
  onSettingsChange: (settings: any) => void;
  onProcess: () => void;
  isProcessing: boolean;
  onReset: () => void;
}

export default function Controls({
  settings,
  onSettingsChange,
  onProcess,
  isProcessing,
  onReset,
}: ControlsProps) {
  const updateSetting = (key: string, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass rounded-2xl p-6 space-y-6"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <Settings2 className="w-5 h-5 text-indigo-400" />
        <h3 className="font-semibold">Render Settings</h3>
      </div>

      {/* Quality Mode Toggle */}
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Rendering Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateSetting('useNeural', false)}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
              !settings.useNeural
                ? 'bg-indigo-500 text-white'
                : 'bg-white/5 hover:bg-white/10'
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Path Tracing</span>
          </button>
          <button
            onClick={() => updateSetting('useNeural', true)}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
              settings.useNeural
                ? 'bg-purple-500 text-white'
                : 'bg-white/5 hover:bg-white/10'
            )}
          >
            <Cpu className="w-4 h-4" />
            <span className="text-sm font-medium">Neural (Fast)</span>
          </button>
        </div>
      </div>

      {/* Samples Slider */}
      {!settings.useNeural && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3"
        >
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Samples per Pixel</span>
            <span className="font-medium">{settings.samples}</span>
          </div>
          <input
            type="range"
            min="16"
            max="512"
            step="16"
            value={settings.samples}
            onChange={(e) => updateSetting('samples', parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Fast (16)</span>
            <span>Quality (512)</span>
          </div>
        </motion.div>
      )}

      {/* Max Bounces */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Max Bounces</span>
          <span className="font-medium">{settings.maxBounces}</span>
        </div>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={settings.maxBounces}
          onChange={(e) => updateSetting('maxBounces', parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Exposure */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Exposure</span>
          <span className="font-medium">{settings.exposure.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="3.0"
          step="0.1"
          value={settings.exposure}
          onChange={(e) => updateSetting('exposure', parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center justify-between p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
          <span className="text-sm">AI Denoising</span>
          <input
            type="checkbox"
            checked={settings.useDenoising}
            onChange={(e) => updateSetting('useDenoising', e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 bg-transparent"
          />
        </label>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4 border-t border-white/10">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold transition-all',
            isProcessing
              ? 'bg-white/10 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 glow'
          )}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full processing-ring" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Start Rendering</span>
            </>
          )}
        </button>

        <button
          onClick={onReset}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>
    </motion.div>
  );
}