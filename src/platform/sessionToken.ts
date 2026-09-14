import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// Native shells cannot use the HttpOnly session cookie (see README "Optional
// profile PIN"), so they hold the signed token and send it as a bearer header.
// It is kept apart from the outbox mirror in storage.ts on purpose.
const TOKEN_KEY = "hanja-trainer:session-token";
let token: string | null = null;
let writes = Promise.resolve();

export function nativeShell(): boolean {
  return Boolean(import.meta.env.VITE_API_ORIGIN);
}

export function getSessionToken(): string | null {
  return token;
}

function persist(next: string | null) {
  if (!Capacitor.isNativePlatform()) return;
  // Serialized so a slow set cannot finish after a later sign-out removes the key.
  // ponytail: Preferences is app-sandboxed but unencrypted; the token expires within two hours.
  writes = writes.then(() => next === null ? Preferences.remove({ key: TOKEN_KEY }) : Preferences.set({ key: TOKEN_KEY, value: next }))
    .catch(() => { console.warn("Could not save the session to native storage."); });
}

export function setSessionToken(next: string | null) {
  token = next;
  persist(next);
}

// Renewals arrive on every bearer response. Accept one only while the token that
// request carried is still current, so a late response from a profile that was
// just signed out or switched away cannot restore its session.
export function renewSessionToken(sent: string, renewed: string | null) {
  if (renewed && token === sent) setSessionToken(renewed);
}

// The server rejected the token it was sent; forget it so the app can sign in again.
export function discardSessionToken(sent: string) {
  if (token === sent) setSessionToken(null);
}

function expiry(value: string): number {
  return Number(value.split(".")[1]);
}

// Call before rendering the app. Tokens are `${profileId}.${expiryMs}.${signature}`;
// an expired one is dropped so a lone PIN-less profile signs in again instead of failing.
export async function loadSessionToken(now = Date.now()): Promise<void> {
  if (!Capacitor.isNativePlatform() || token !== null) return;
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    if (token !== null || value === null) return;
    if (expiry(value) > now) token = value;
    else setSessionToken(null);
  } catch { console.warn("Could not read the saved session."); }
}

// The Worker never auto-selects the lone PIN-less profile for bearer clients, so a
// native shell without a token must select it explicitly before loading it.
export function needsExplicitSelection(profile: { hasPin: boolean }): boolean {
  return nativeShell() && token === null && !profile.hasPin;
}
