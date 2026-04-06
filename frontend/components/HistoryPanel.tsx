'use client';

import { Clock3, Image as ImageIcon, Trash2, Video } from 'lucide-react';

import { HistoryItem } from '@/app/types';

interface HistoryPanelProps {
  items: HistoryItem[];
  onClear: () => void;
}

export default function HistoryPanel({ items, onClear }: HistoryPanelProps) {
  return (
    <section className="glass rounded-2xl p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-cyan-50 text-glow">
          <Clock3 className="h-4 w-4 text-cyan-700" />
          <h3 className="font-heading text-sm font-semibold">Recent Jobs</h3>
        </div>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="glass inline-flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-xs font-medium text-purple-200 hover:border-purple-500/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-pink-200/75">No jobs yet. Start a render to build your timeline.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="glass rounded-lg border border-cyan-500/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.mediaType === 'video' ? (
                    <Video className="h-4 w-4 text-fuchsia-600" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-cyan-700" />
                  )}
                  <p className="max-w-[170px] truncate text-xs font-medium text-cyan-50 text-glow">
                    {item.name}
                  </p>
                </div>
                <span className="text-[11px] text-pink-200/70">{new Date(item.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-[11px] text-purple-200/80">
                {item.settings.useNeural ? 'Neural' : 'Path'} · {item.settings.samples} spp · {item.settings.maxBounces} bounces
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
