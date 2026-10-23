import { startJob } from '@/server/services/economyService';
import { respondToPost } from '@/server/http/routeHelpers';
import { validateStartJobBody } from '@/features/economy/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/jobs/start { jobKey } → the job board with the new shift as `active`.
 * Pay and duration are the database's; any field other than jobKey is refused.
 */
export async function POST(request: Request) {
  return respondToPost(request, validateStartJobBody, startJob);
}
