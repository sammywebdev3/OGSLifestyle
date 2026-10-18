'use client';

import type { Direction } from '@/types/game';
import type { GameBus } from '@/game/events';

const PADS: { dir: Direction; label: string; cls: string }[] = [
  { dir: 'up', label: '▲', cls: 'col-start-2 row-start-1' },
  { dir: 'left', label: '◀', cls: 'col-start-1 row-start-2' },
  { dir: 'right', label: '▶', cls: 'col-start-3 row-start-2' },
  { dir: 'down', label: '▼', cls: 'col-start-2 row-start-3' },
];

/** On-screen D-pad for touch devices (hidden on devices with a fine pointer). */
export function TouchControls({ bus }: { bus: GameBus }) {
  const press = (direction: Direction, pressed: boolean) => bus.ui.emit('input:direction', { direction, pressed });
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 [@media(pointer:fine)]:hidden">
      <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1">
        {PADS.map((p) => (
          <button
            key={p.dir}
            type="button"
            aria-label={`Move ${p.dir}`}
            className={`${p.cls} grid h-14 w-14 touch-none select-none place-items-center rounded-2xl bg-adire-900/70 text-xl text-cream active:bg-ogun-500`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(p.dir, true); }}
            onPointerUp={() => press(p.dir, false)}
            onPointerCancel={() => press(p.dir, false)}
            onPointerLeave={() => press(p.dir, false)}
          >{p.label}</button>
        ))}
      </div>
    </div>
  );
}
