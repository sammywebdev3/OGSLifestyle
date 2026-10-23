'use client';

import type { Direction } from '@/types/game';
import type { GameBus } from '@/game/events';

const PADS: { dir: Direction; rotate: number; cls: string }[] = [
  { dir: 'up', rotate: 0, cls: 'col-start-2 row-start-1' },
  { dir: 'left', rotate: -90, cls: 'col-start-1 row-start-2' },
  { dir: 'right', rotate: 90, cls: 'col-start-3 row-start-2' },
  { dir: 'down', rotate: 180, cls: 'col-start-2 row-start-3' },
];

/** On-screen D-pad for touch devices (hidden on devices with a fine pointer). */
export function TouchControls({ bus }: { bus: GameBus }) {
  const press = (direction: Direction, pressed: boolean) => bus.ui.emit('input:direction', { direction, pressed });
  return (
    <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] [@media(pointer:fine)]:hidden">
      <div className="pointer-events-auto relative grid grid-cols-3 grid-rows-3 gap-1 rounded-full bg-adire-900/35 p-1.5 shadow-card ring-1 ring-white/15 backdrop-blur-sm">
        <span aria-hidden="true" className="col-start-2 row-start-2 m-auto h-3 w-3 rounded-full bg-cream/30" />
        {PADS.map((p) => (
          <button
            key={p.dir}
            type="button"
            aria-label={`Move ${p.dir}`}
            className={`${p.cls} grid h-12 w-12 touch-none select-none place-items-center rounded-2xl bg-adire-900/75 text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/10 transition-colors active:bg-ogun-500 active:ring-ogun-400`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(p.dir, true); }}
            onPointerUp={() => press(p.dir, false)}
            onPointerCancel={() => press(p.dir, false)}
            onPointerLeave={() => press(p.dir, false)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ transform: `rotate(${p.rotate}deg)` }} aria-hidden="true">
              <path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
