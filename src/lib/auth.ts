// Authentication is server-side now (httpOnly session cookie, see session.server.ts + useMe()).
// These stubs remain only for legacy imports; they never grant access.

/** @deprecated use useMe() */
export function isLoggedIn(): boolean {
  return false;
}

/** @deprecated session is set by POST /api/auth/login and cleared by POST /api/auth/logout */
export function setLoggedIn(_v: boolean): void {
  // no-op
}
