import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

function nativeListener(register: () => Promise<{ remove: () => Promise<void> }>): () => void {
  const handle = register();
  return () => { void handle.then((listener) => listener.remove()).catch(() => undefined); };
}

// Mobile OSes suspend the WebView without firing `online`, so pending work is also
// flushed when the app or tab comes back to the foreground.
export function onAppResume(callback: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    return nativeListener(() => App.addListener("appStateChange", ({ isActive }) => { if (isActive) callback(); }));
  }
  if (typeof document === "undefined") return () => undefined;
  const handleVisibility = () => { if (document.visibilityState === "visible") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}

export function onAppInactive(callback: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    return nativeListener(() => App.addListener("appStateChange", ({ isActive }) => { if (!isActive) callback(); }));
  }
  if (typeof document === "undefined") return () => undefined;
  const handleVisibility = () => { if (document.visibilityState === "hidden") callback(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}

// Registering a listener replaces Capacitor's default Android back navigation, so only
// screens that must intercept it (an active session) should call this. No-op elsewhere.
export function onBackButton(callback: () => void): () => void {
  if (Capacitor.getPlatform() !== "android") return () => undefined;
  return nativeListener(() => App.addListener("backButton", () => callback()));
}
