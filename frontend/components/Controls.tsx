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
      className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm space-y-6"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <Settings2 className="w-5 h-5 text-cyan-600" />
        <div>
          <h3 className="font-semibold text-slate-900">Render Settings</h3>
          <p className="text-xs text-slate-500">Estimated time ~{estimatedSeconds}s</p>
        </div>
      </div>

      <PresetsPanel onApplyPreset={onSettingsChange} />

      {/* Quality Mode Toggle */}
      <div className="space-y-3">
        <label className="text-sm text-slate-600">Rendering Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateSetting('useNeural', false)}
            aria-label="Switch to path tracing mode"
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
              !settings.useNeural
                ? 'bg-cyan-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Path Tracing</span>
          </button>
          <button
            onClick={() => updateSetting('useNeural', true)}
            aria-label="Switch to neural fast mode"
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
              settings.useNeural
                ? 'bg-amber-500 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
            <span className="text-slate-600">Samples per Pixel</span>
            <span className="font-medium text-slate-900">{settings.samples}</span>
          </div>
          <input
            type="range"
            min="16"
            max="512"
            step="16"
            value={settings.samples}
            onChange={(e) => updateSetting('samples', parseInt(e.target.value))}
            className="w-full"
            aria-label="Samples per pixel"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Fast (16)</span>
            <span>Quality (512)</span>
          </div>
        </motion.div>
      )}

      {/* Max Bounces */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Max Bounces</span>
          <span className="font-medium text-slate-900">{settings.maxBounces}</span>
        </div>
        <input
          type="range"
          min="1"
          max="16"
          step="1"
          value={settings.maxBounces}
          onChange={(e) => updateSetting('maxBounces', parseInt(e.target.value))}
          className="w-full"
          aria-label="Maximum light bounces"
        />
      </div>

      {/* Exposure */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Exposure</span>
          <span className="font-medium text-slate-900">{settings.exposure.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="3.0"
          step="0.1"
          value={settings.exposure}
          onChange={(e) => updateSetting('exposure', parseFloat(e.target.value))}
          className="w-full"
          aria-label="Exposure"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200">
          <span className="text-sm">AI Denoising</span>
          <input
            type="checkbox"
            checked={settings.useDenoising}
            onChange={(e) => updateSetting('useDenoising', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-600 bg-transparent"
          />
        </label>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold transition-all',
            isProcessing
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-700 hover:to-teal-700'
          )}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-700 rounded-full processing-ring" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Start Rendering</span>
            </>
          )}
        </button>

        {isProcessing && onCancel && (
          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all"
          >
            <Square className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        )}

        <button
          onClick={onReset}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>
    </motion.div>
  );
}