import { abandonJob } from '@/server/services/economyService';
import { respondToPost } from '@/server/http/routeHelpers';
import { validateAbandonBody } from '@/features/economy/request';

export const dynamic = 'force-dynamic';

/** POST /api/jobs/abandon {} → the job board. Stops the shift in progress without pay. */
export async function POST(request: Request) {
  return respondToPost(request, validateAbandonBody, (db) => abandonJob(db));
}
