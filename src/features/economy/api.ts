import type { ClaimResult, JobsSnapshot, ShopKey, ShopPurchaseResult, ShopSnapshot } from '@/types/economy';
import { call } from '@/features/player/api';

export const fetchJobs = () => call<JobsSnapshot>('/api/jobs');

/** Only the job key is sent: pay and duration are the server's. */
export const postStartJob = (jobKey: string) => call<JobsSnapshot>('/api/jobs/start', { method: 'POST', body: JSON.stringify({ jobKey }) });

/** The request id makes a retry safe: the server pays a shift at most once. */
export const postClaimJob = (requestId: string) => call<ClaimResult>('/api/jobs/claim', { method: 'POST', body: JSON.stringify({ requestId }) });

export const postAbandonJob = () => call<JobsSnapshot>('/api/jobs/abandon', { method: 'POST', body: '{}' });

export const fetchShop = (shop: ShopKey) => call<ShopSnapshot>(`/api/shop?shop=${encodeURIComponent(shop)}`);

/** Only the item, how many and this attempt's request id are sent: the server decides the price and balance. */
export const postBuyItem = (itemKey: string, quantity: number, requestId: string) =>
  call<ShopPurchaseResult>('/api/shop/buy', { method: 'POST', body: JSON.stringify({ itemKey, quantity, requestId }) });
