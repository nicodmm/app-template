import bcrypt from "bcryptjs";

const COST = 10;

export async function hashSharePassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifySharePassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Per-token in-memory rate limiter. 5 fails in 60s → 5-min lockout.
// Vercel serverless instances each keep their own Map — good enough for MVP;
// upgrade to a Postgres counter if the limit becomes a real concern.
interface AttemptState {
  failuresWindowStart: number;
  failureCount: number;
  lockedUntil: number;
}
const attempts = new Map<string, AttemptState>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;

export function isRateLimited(token: string): {
  limited: boolean;
  retryAt: number | null;
} {
  const state = attempts.get(token);
  if (!state) return { limited: false, retryAt: null };
  if (state.lockedUntil > Date.now()) {
    return { limited: true, retryAt: state.lockedUntil };
  }
  return { limited: false, retryAt: null };
}

export function recordPasswordAttempt(
  token: string,
  success: boolean
): void {
  const now = Date.now();
  if (success) {
    attempts.delete(token);
    return;
  }
  const state = attempts.get(token) ?? {
    failuresWindowStart: now,
    failureCount: 0,
    lockedUntil: 0,
  };
  if (now - state.failuresWindowStart > WINDOW_MS) {
    state.failuresWindowStart = now;
    state.failureCount = 0;
  }
  state.failureCount += 1;
  if (state.failureCount >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
    state.failureCount = 0;
    state.failuresWindowStart = now;
  }
  attempts.set(token, state);
}
