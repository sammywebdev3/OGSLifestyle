'use client';

import { EMOTES, EMOTE_IDS, type EmoteId } from '@/features/multiplayer/chat';

/** Shown when another player is within reach: send a quick emote (keys 1–4). */
export function EmoteBar({ name, onEmote }: { name: string; onEmote: (emote: EmoteId) => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-44 flex justify-center px-4 sm:bottom-20">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full bg-adire-900/85 px-3 py-1.5 text-cream shadow-card backdrop-blur">
        <span className="max-w-[9rem] truncate pr-1 text-xs font-bold text-ogun-400">Near {name}</span>
        {EMOTE_IDS.map((id, i) => (
          <button key={id} type="button" onClick={() => onEmote(id)} title={`${EMOTES[id].label} (${i + 1})`} aria-label={EMOTES[id].label}
            className="flex items-center gap-1 rounded-full bg-adire-700/80 px-2 py-1 text-sm hover:bg-ogun-600">
            <span aria-hidden>{EMOTES[id].icon}</span>
            <span className="hidden text-xs sm:inline">{EMOTES[id].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
