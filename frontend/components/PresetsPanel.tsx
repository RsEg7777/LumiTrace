'use client';

import { motion } from 'framer-motion';

import { RenderSettings } from '@/app/types';
import { cn } from '@/lib/utils';

interface PresetsPanelProps {
  onApplyPreset: (settings: RenderSettings) => void;
}

const PRESETS: Array<{ name: string; description: string; settings: RenderSettings }> = [
  {
    name: 'Draft',
    description: 'Fast preview for quick iteration',
    settings: {
      samples: 32,
      maxBounces: 2,
      useDenoising: false,
      useNeural: false,
      exposure: 1,
    },
  },
  {
    name: 'Balanced',
    description: 'Good quality with moderate render time',
    settings: {
      samples: 96,
      maxBounces: 4,
      useDenoising: true,
      useNeural: false,
      exposure: 1,
    },
  },
  {
    name: 'Cinematic',
    description: 'High quality with aggressive sampling',
    settings: {
      samples: 256,
      maxBounces: 8,
      useDenoising: true,
      useNeural: false,
      exposure: 1.15,
    },
  },
  {
    name: 'Neural Express',
    description: 'Fast neural approximation mode',
    settings: {
      samples: 64,
      maxBounces: 4,
      useDenoising: true,
      useNeural: true,
      exposure: 1,
    },
  },
];

export default function PresetsPanel({ onApplyPreset }: PresetsPanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">Quality Presets</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((preset, index) => (
          <motion.button
            key={preset.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onApplyPreset(preset.settings)}
            className={cn(
              'rounded-xl border border-slate-200 bg-white p-3 text-left transition-all',
              'hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-sm',
            )}
          >
            <p className="text-sm font-semibold text-slate-900">{preset.name}</p>
            <p className="mt-1 text-xs text-slate-600">{preset.description}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
