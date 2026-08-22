/**
 * Client-side session storage.
 *
 * The web app is fully client-side for auth: tokens from /api/auth/login and
 * /api/auth/register live in localStorage and are attached to requests as
 * Bearer headers. Server-side route handlers verify the JWT themselves via
 * jwt-middleware; nothing here touches the network.
 */

export interface ClientUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  createdAt?: string;
}

export interface ClientSession {
  accessToken: string;
  refreshToken: string;
  user: ClientUser;
}

const SESSION_KEY = "black-owned.session";

export function getSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientSession;
    if (!parsed?.accessToken || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: ClientSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

/**
 * Authorization headers for fetch() calls to protected API routes.
 */
export function authHeaders(): Record<string, string> {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
}
