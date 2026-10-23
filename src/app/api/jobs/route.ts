import { getJobs } from '@/server/services/economyService';
import { respond } from '@/server/http/routeHelpers';

export const dynamic = 'force-dynamic';

/** GET /api/jobs → { jobs, active, shiftsToday, dailyLimit, serverNow, cash }. */
export async function GET() {
  return respond(getJobs);
}
