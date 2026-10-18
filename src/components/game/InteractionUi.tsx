'use client';

import type { InteractionTarget } from '@/types/game';
import { Button } from '@/components/ui/Button';

/** "Press E" prompt shown when the player stands near something interactive. */
export function InteractionPrompt({ target, onInteract }: { target: InteractionTarget; onInteract: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-4 sm:bottom-8">
      <button type="button" onClick={onInteract} className="pointer-events-auto flex items-center gap-2 rounded-full bg-palm-500 px-4 py-2.5 font-bold text-ink shadow-pop">
        <kbd className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-black text-palm-300">E</kbd>
        {target.verb}: {target.label}
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
