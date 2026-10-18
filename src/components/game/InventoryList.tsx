import type { Inventory } from '@/types/inventory';
import { ITEMS } from '@/config/game';

export function InventoryList({ inventory }: { inventory: Inventory }) {
  if (!inventory.items.length) return <p className="text-sm text-ink/60">Your bag is empty.</p>;
  return (
    <ul className="space-y-2">
      {inventory.items.map((it) => {
        const def = ITEMS[it.key];
        return (
          <li key={it.key} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/5">
            <span className="text-2xl" aria-hidden="true">{def.icon}</span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{def.name}{it.quantity > 1 && <span className="ml-1 text-ink/50">×{it.quantity}</span>}</span>
              <span className="block text-xs text-ink/60">{def.description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
