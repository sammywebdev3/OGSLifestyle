/** Fixed auth error codes shown on the login screen (never echo raw query text). */
export const AUTH_ERROR_MESSAGES = {
  'link-expired': 'That link has expired or was already used. Sign in, or create your account again to get a new confirmation email.',
  callback: "We couldn't confirm that sign-in link. Please try signing in again.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

export function toAuthErrorCode(value: unknown): AuthErrorCode | null {
  return typeof value === 'string' && value in AUTH_ERROR_MESSAGES ? (value as AuthErrorCode) : null;
}

/** Map Supabase's redirect error params (error, error_code) to one of our codes. */
export function codeFromSupabaseError(errorCode: string | null, error: string | null): AuthErrorCode | null {
  if (!errorCode && !error) return null;
  return errorCode === 'otp_expired' || errorCode === 'flow_state_expired' ? 'link-expired' : 'callback';
}
