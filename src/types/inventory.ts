import type { InventoryId } from './player';

export type ItemKey = 'phone-basic' | 'apartment-key' | 'water-sachet' | 'adire-scarf';

export interface ItemDefinition {
  key: ItemKey;
  name: string;
  icon: string;
  description: string;
}

export interface InventoryItem {
  key: ItemKey;
  quantity: number;
}

export interface Inventory {
  id: InventoryId;
  items: InventoryItem[];
}
