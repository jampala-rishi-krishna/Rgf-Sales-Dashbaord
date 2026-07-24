export const AUTH_KEY = "rgf_isLoggedIn";
export const LOGIN_EMAIL = import.meta.env.VITE_LOGIN_EMAIL;
export const LOGIN_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD;

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_KEY) === "true";
}

export function setLoggedIn(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(AUTH_KEY, "true");
  else window.localStorage.removeItem(AUTH_KEY);
}
