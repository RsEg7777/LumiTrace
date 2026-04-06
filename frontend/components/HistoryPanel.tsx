'use client';

import { Clock3, Image as ImageIcon, Trash2, Video } from 'lucide-react';

import { HistoryItem } from '@/app/types';

interface HistoryPanelProps {
  items: HistoryItem[];
  onClear: () => void;
}

export default function HistoryPanel({ items, onClear }: HistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-transparent/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-200">
          <Clock3 className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Recent Jobs</h3>
        </div>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-zinc-400">No jobs yet. Start a render to build your timeline.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.mediaType === 'video' ? (
                    <Video className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-zinc-400" />
                  )}
                  <p className="max-w-[170px] truncate text-xs font-medium text-zinc-200">
                    {item.name}
                  </p>
                </div>
                <span className="text-[11px] text-zinc-400">{new Date(item.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {item.settings.useNeural ? 'Neural' : 'Path'} · {item.settings.samples} spp · {item.settings.maxBounces} bounces
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
