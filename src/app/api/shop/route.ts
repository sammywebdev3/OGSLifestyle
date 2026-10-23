import { NextResponse } from 'next/server';
import { getShop } from '@/server/services/economyService';
import { respond } from '@/server/http/routeHelpers';
import { isShopKey } from '@/features/economy/request';

export const dynamic = 'force-dynamic';

/** GET /api/shop?shop=buka|mama-t-stores → { shop, items, cash }. */
export async function GET(request: Request) {
  const shop = new URL(request.url).searchParams.get('shop');
  if (!isShopKey(shop)) return NextResponse.json({ error: 'No such shop.', code: 'invalid' }, { status: 400 });
  return respond((db) => getShop(db, shop));
}
