import { claimJob } from '@/server/services/economyService';
import { respondToPost } from '@/server/http/routeHelpers';
import { validateClaimBody } from '@/features/economy/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/jobs/claim { requestId } → { shiftId, jobKey, pay, cash, transactionId, replayed, jobs }.
 * Pays the caller's finished shift once; a retry with the same requestId is answered, not paid again.
 */
export async function POST(request: Request) {
  return respondToPost(request, validateClaimBody, claimJob);
}
