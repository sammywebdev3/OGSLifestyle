import { buyItem } from '@/server/services/economyService';
import { respondToPost } from '@/server/http/routeHelpers';
import { validateShopBuyBody } from '@/features/economy/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/shop/buy { itemKey, quantity, requestId } → { itemKey, quantity, total, cash, owned, transactionId, replayed }.
 * The price and the buyer's balance are decided by the database; any other field is refused.
 */
export async function POST(request: Request) {
  return respondToPost(request, validateShopBuyBody, buyItem);
}
