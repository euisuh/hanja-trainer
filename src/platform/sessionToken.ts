// Native shells cannot use the HttpOnly session cookie (see README "Optional
// profile PIN"), so they hold the signed token and send it as a bearer header.
// ponytail: memory only; the app must sign in again after relaunch until issue 288 persists it.
let token: string | null = null;

export function nativeShell(): boolean {
  return Boolean(import.meta.env.VITE_API_ORIGIN);
}

export function getSessionToken(): string | null {
  return token;
}

export function setSessionToken(next: string | null) {
  token = next;
}

// Renewals arrive on every bearer response. Accept one only while the token that
// request carried is still current, so a late response from a profile that was
// just signed out or switched away cannot restore its session.
export function renewSessionToken(sent: string, renewed: string | null) {
  if (renewed && token === sent) token = renewed;
}

// The Worker never auto-selects the lone PIN-less profile for bearer clients, so a
// native shell without a token must select it explicitly before loading it.
export function needsExplicitSelection(profile: { hasPin: boolean }): boolean {
  return nativeShell() && token === null && !profile.hasPin;
}
