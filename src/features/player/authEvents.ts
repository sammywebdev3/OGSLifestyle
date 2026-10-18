/**
 * Decides whether a Supabase auth event should reload the player.
 *
 * Supabase can emit SIGNED_IN again for the SAME user (e.g. when a tab regains
 * focus or a session is recovered), and TOKEN_REFRESHED regularly. Reloading on
 * those would rebuild the player object and restart the game world, so only a
 * real change of signed-in user counts.
 */
export function shouldReloadOnAuthEvent(event: string, newUserId: string | null, currentUserId: string | null): boolean {
  if (event === 'SIGNED_OUT') return currentUserId !== null;
  if (event === 'SIGNED_IN') return newUserId !== currentUserId;
  return false; // INITIAL_SESSION (handled on mount), TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY…
}
