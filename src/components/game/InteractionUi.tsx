'use client';

import type { InteractionTarget } from '@/types/game';
import { Button } from '@/components/ui/Button';

/** "Press E" prompt shown when the player stands near something interactive. */
export function InteractionPrompt({ target, onInteract }: { target: InteractionTarget; onInteract: () => void }) {
  return (
    // On touch screens it sits above the D-pad (bottom left), so the two never overlap.
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4 [@media(pointer:coarse)]:bottom-[calc(13rem_+_env(safe-area-inset-bottom))]">
      <button type="button" onClick={onInteract} className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-palm-500 py-2 pl-2 pr-4 font-bold text-ink shadow-pop ring-2 ring-palm-300/80 transition-transform active:scale-95">
        <kbd className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-palm-300">E</kbd>
        <span className="truncate">{target.verb}: {target.label}</span>
      </button>
    </div>
  );
}

/** Dialog shown after interacting. The apartment door offers to go inside. */
export function InteractionDialog({ target, onClose, onEnterApartment }: { target: InteractionTarget; onClose: () => void; onEnterApartment: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-end bg-black/30 p-4 sm:place-items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="interaction-title" className="w-full max-w-md rounded-3xl bg-cream p-5 text-ink shadow-card" onClick={(e) => e.stopPropagation()}>
        <h2 id="interaction-title" className="font-display text-xl font-black">{target.label}</h2>
        <p className="mt-2 text-sm text-ink/80">{target.description}</p>
        <div className="mt-5 flex gap-2">
          {target.id === 'apartment-door' && <Button onClick={onEnterApartment} className="flex-1">Go inside</Button>}
          <Button variant="secondary" onClick={onClose} className="flex-1" autoFocus>{target.id === 'apartment-door' ? 'Stay outside' : 'OK'}</Button>
        </div>
      </div>
    </div>
  );
}
