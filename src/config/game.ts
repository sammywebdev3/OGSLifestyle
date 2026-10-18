import type { AvatarSelection, BodyType, Headwear, LocationId, OutfitColor, SkinTone } from '@/types/player';
import type { ItemDefinition, ItemKey, InventoryItem } from '@/types/inventory';

/**
 * Game constants. The *server* copies of economic values (starting cash) live in
 * the database function `create_character` (supabase/migrations). This value is
 * only used for the offline guest preview and must match the migration.
 */
export const STARTING_CASH = 50_000;

export const CHARACTER_NAME = { min: 3, max: 20 } as const;

export const LOCATIONS: Record<LocationId, { name: string; area: string }> = {
  'kuto-starter-apartment': { name: 'Starter Apartment', area: 'Kuto, Abeokuta' },
  'kuto-street': { name: 'Kuto Street', area: 'Kuto, Abeokuta' },
};

export const SKIN_TONES: Record<SkinTone, { label: string; hex: string }> = {
  deep: { label: 'Deep', hex: '#4a2a17' },
  brown: { label: 'Brown', hex: '#6b3e26' },
  warm: { label: 'Warm', hex: '#8d5524' },
  light: { label: 'Light', hex: '#b97a50' },
};

export const BODY_TYPES: Record<BodyType, { label: string }> = {
  masc: { label: 'Guy' },
  femme: { label: 'Babe' },
};

export const HEADWEAR: Record<Headwear, { label: string }> = {
  none: { label: 'Low cut' },
  fila: { label: 'Fila' },
  gele: { label: 'Gele' },
  cap: { label: 'Face cap' },
  braids: { label: 'Braids' },
};

export const OUTFIT_COLORS: Record<OutfitColor, { label: string; hex: string }> = {
  ogun: { label: 'Gateway green', hex: '#12935a' },
  adire: { label: 'Adire indigo', hex: '#3a4fb0' },
  laterite: { label: 'Laterite', hex: '#d4693d' },
  palm: { label: 'Palm gold', hex: '#f2b632' },
  cream: { label: 'Cream', hex: '#f4ead2' },
  ink: { label: 'Ink', hex: '#2a2b33' },
};

export const DEFAULT_AVATAR: AvatarSelection = { body: 'masc', skin: 'brown', headwear: 'fila', outfit: 'ogun' };

export const ITEMS: Record<ItemKey, ItemDefinition> = {
  'phone-basic': { key: 'phone-basic', name: 'Tecno phone', icon: '📱', description: 'Cracked screen, strong battery.' },
  'apartment-key': { key: 'apartment-key', name: 'Apartment key', icon: '🔑', description: 'Opens your self-contain in Kuto.' },
  'water-sachet': { key: 'water-sachet', name: 'Pure water', icon: '💧', description: 'A cold sachet for the heat.' },
  'adire-scarf': { key: 'adire-scarf', name: 'Adire scarf', icon: '🧣', description: 'Hand-dyed in Itoku.' },
};

/** Items every new character starts with (mirrors the database function). */
export const STARTER_ITEMS: InventoryItem[] = [
  { key: 'phone-basic', quantity: 1 },
  { key: 'apartment-key', quantity: 1 },
  { key: 'water-sachet', quantity: 3 },
];
