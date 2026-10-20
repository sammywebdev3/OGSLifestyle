import type { LandSnapshot, PurchaseResult } from '@/types/land';
import { call } from '@/features/player/api';

export const fetchLand = () => call<LandSnapshot>('/api/land');

/** Only the plot key and this attempt's request id are sent: the server decides price, buyer and balance. */
export const postBuyPlot = (plotKey: string, requestId: string) =>
  call<PurchaseResult>('/api/land/buy', { method: 'POST', body: JSON.stringify({ plotKey, requestId }) });
