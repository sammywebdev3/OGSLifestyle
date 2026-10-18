'use client';

import type { Inventory } from '@/types/inventory';
import { InventoryList } from './InventoryList';

export function InventoryPanel({ inventory, onClose }: { inventory: Inventory; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Inventory" className="h-full w-full max-w-sm overflow-y-auto bg-cream p-5 text-ink shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-black">🎒 Inventory</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-bold ring-1 ring-ink/15 hover:bg-ink/5" autoFocus>Close</button>
        </div>
        <InventoryList inventory={inventory} />
        <p className="mt-4 text-xs text-ink/50">Using, buying and selling items will be handled by the server in a later phase.</p>
      </aside>
    </div>
  );
}
