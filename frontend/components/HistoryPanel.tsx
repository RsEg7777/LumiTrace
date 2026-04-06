'use client';

import { Clock3, Image as ImageIcon, Trash2, Video } from 'lucide-react';

import { HistoryItem } from '@/app/types';

interface HistoryPanelProps {
  items: HistoryItem[];
  onClear: () => void;
}

export default function HistoryPanel({ items, onClear }: HistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <Clock3 className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Recent Jobs</h3>
        </div>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-500">No jobs yet. Start a render to build your timeline.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.mediaType === 'video' ? (
                    <Video className="h-4 w-4 text-sky-600" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-emerald-600" />
                  )}
                  <p className="max-w-[170px] truncate text-xs font-medium text-slate-800">
                    {item.name}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                {item.settings.useNeural ? 'Neural' : 'Path'} · {item.settings.samples} spp · {item.settings.maxBounces} bounces
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
