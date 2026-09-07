import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { matchPath, Navigate, useLocation, useNavigate } from "react-router-dom";
import { themes } from "./design/tokens";
import { ProfileProvider, type ActiveProfile } from "./features/profile/ProfileContext";
import { setAnswerSubmitProfile } from "./features/session/useAnswerSubmit";
import { resetSettingsClientState } from "./features/settings/useSettings";
import { ApiClientError, ONBOARDING_COMPLETED_EVENT, PIN_REQUIRED_EVENT, SETTINGS_UPDATED_EVENT, apiClient, pauseProfileRequests, resumeProfileRequests } from "./lib/apiClient";
import { AppRoutes, routes, type Screen } from "./routes";
import { ProfilePicker } from "./screens/ProfilePicker";
import { UnlockScreen } from "./screens/UnlockScreen";
import type { ProfileResponse, PublicProfile, SettingsResponse } from "./shared/api";
import type { ThemeId } from "./shared/settings";
import { AppHeader } from "./shell/AppHeader";
import { BottomNav } from "./shell/BottomNav";
import { useGlobalHotkeys } from "./shell/useGlobalHotkeys";

const headerScreens = new Set<Screen>(["home", "review", "stats", "settings", "detail", "study", "about"]);
const navlessScreens = new Set<Screen>(["onboarding", "placement", "placement-result"]);
const sessionScreens = new Set<Screen>(["placement", "lesson", "review-session", "session-complete", "speaking"]);

type Gate = "checking" | "error" | "choosing" | "locked" | "unlocked";

function isProfileRequired(caught: unknown): boolean {
  return caught instanceof ApiClientError && (caught.code === "pin_required" || caught.code === "profile_required");
}

function identity(profile: ProfileResponse): ActiveProfile {
  return { id: profile.id, name: profile.name, isAdmin: profile.isAdmin };
}

function afterProfileUnmount(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [gate, setGate] = useState<Gate>("checking");
  const [retryKey, setRetryKey] = useState(0);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [activeProfile, setActiveProfile] = useState<ActiveProfile | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("quiet-technical");
  const screen = routes.find((route) => matchPath({ path: route.path, end: true }, pathname))?.screen ?? "onboarding";
  const screenRef = useRef(screen);
  const sessionActive = sessionScreens.has(screen);

  useGlobalHotkeys({ sessionActive, modalOpen: gate !== "unlocked" });

  useEffect(() => {
    navigateRef.current = navigate;
    screenRef.current = screen;
  }, [navigate, screen]);

  const teardownActiveProfile = useCallback(() => {
    setAnswerSubmitProfile(null);
    resetSettingsClientState();
    setActiveProfile(null);
    setTheme("quiet-technical");
    setGate("checking");
  }, []);

  const activateCurrentProfile = useCallback(async (mode: "preserve" | "select" | "guard", signal?: AbortSignal) => {
    const [profile, onboarding] = await Promise.all([
      apiClient.profile(signal, false),
      apiClient.onboardingState(signal, false),
    ]);
    setActiveProfile(identity(profile));
    const needsOnboarding = mode !== "preserve" && !onboarding.onboarded;
    setOnboardingRequired(needsOnboarding);
    setSelectedProfile(null);
    setGate("unlocked");
    if (mode === "select") {
      navigateRef.current(onboarding.onboarded ? "/home" : "/onboarding");
      return;
    }
    if (needsOnboarding && !navlessScreens.has(screenRef.current)) navigateRef.current("/onboarding", { replace: true });
  }, []);

  // Shared by requireProfile and switchProfile: fetch profiles and land on the
  // right gate -- auto-activate a single PIN-less profile, lock screen for a
  // single PIN-protected one, otherwise the picker. `isActive` lets callers with
  // their own cancellation flag (requireProfile's effect) skip applying stale state.
  const resolveProfileGate = useCallback(async (isActive: () => boolean = () => true) => {
    const result = await apiClient.profiles();
    if (!isActive()) return;
    setProfiles(result.profiles);
    if (result.profiles.length === 1) {
      const onlyProfile = result.profiles[0];
      setSelectedProfile(onlyProfile);
      if (onlyProfile.hasPin) {
        setGate("locked");
        return;
      }
      resumeProfileRequests();
      await activateCurrentProfile("preserve");
      return;
    }
    setSelectedProfile(null);
    setGate("choosing");
  }, [activateCurrentProfile]);

  useEffect(() => {
    const controller = new AbortController();
    async function boot() {
      resumeProfileRequests();
      try {
        const result = await apiClient.profiles(controller.signal);
        if (controller.signal.aborted) return;
        setProfiles(result.profiles);
        if (result.profiles.length !== 1) {
          try {
            await activateCurrentProfile("guard", controller.signal);
          } catch (caught) {
            if (!controller.signal.aborted) setGate(isProfileRequired(caught) ? "choosing" : "error");
          }
          return;
        }

        const onlyProfile = result.profiles[0];
        setSelectedProfile(onlyProfile);
        const state = await apiClient.pinState(controller.signal);
        setLockedUntil(state.lockedUntil);
        try {
          await activateCurrentProfile("preserve", controller.signal);
        } catch (caught) {
          if (!controller.signal.aborted) setGate(isProfileRequired(caught) && state.enabled ? "locked" : "error");
        }
      } catch {
        if (!controller.signal.aborted) setGate("error");
      }
    }
    void boot();
    return () => controller.abort();
  }, [activateCurrentProfile, retryKey]);

  useEffect(() => {
    let active = true;
    let transition: Promise<void> | null = null;
    async function requireProfile() {
      teardownActiveProfile();
      await afterProfileUnmount();
      await pauseProfileRequests();
      try {
        await resolveProfileGate(() => active);
      } catch {
        if (active) setGate("error");
      }
    }
    const handleRequired = () => {
      transition ??= requireProfile().finally(() => { transition = null; });
    };
    window.addEventListener(PIN_REQUIRED_EVENT, handleRequired);
    return () => { active = false; window.removeEventListener(PIN_REQUIRED_EVENT, handleRequired); };
  }, [resolveProfileGate, teardownActiveProfile]);

  useEffect(() => {
    setAnswerSubmitProfile(activeProfile?.id ?? null);
    if (!activeProfile) resetSettingsClientState();
  }, [activeProfile]);

  useEffect(() => {
    const completeOnboarding = () => setOnboardingRequired(false);
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, completeOnboarding);
    return () => window.removeEventListener(ONBOARDING_COMPLETED_EVENT, completeOnboarding);
  }, []);

  useEffect(() => {
    if (!activeProfile) return;
    const controller = new AbortController();
    const updateTheme = (event: Event) => {
      const next = (event as CustomEvent<Partial<SettingsResponse>>).detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, updateTheme);
    void apiClient.settings(controller.signal).then((settings) => setTheme(settings.theme)).catch(() => undefined);
    return () => { controller.abort(); window.removeEventListener(SETTINGS_UPDATED_EVENT, updateTheme); };
  }, [activeProfile]);

  async function selectProfile(profile: PublicProfile) {
    setSelectedProfile(profile);
    setLockedUntil(null);
    if (profile.hasPin) {
      setGate("locked");
      return;
    }
    await apiClient.selectProfile(profile.id);
    resumeProfileRequests();
    await activateCurrentProfile("select");
  }

  async function switchProfile() {
    teardownActiveProfile();
    try {
      await afterProfileUnmount();
      await pauseProfileRequests();
      await apiClient.endSession();
      await resolveProfileGate();
    } catch {
      setGate("error");
    }
  }

  let content;
  if (gate === "checking") {
    content = <main><p>프로필 확인 중…</p></main>;
  } else if (gate === "error") {
    content = <main className="session-empty"><p role="alert">잠금 상태를 확인하지 못했습니다.</p><button onClick={() => { setGate("checking"); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></main>;
  } else if (gate === "choosing") {
    content = <ProfilePicker onSelect={selectProfile} profiles={profiles} />;
  } else if (gate === "locked" && selectedProfile) {
    content = <UnlockScreen
      key={selectedProfile.id}
      lockedUntil={lockedUntil}
      onBack={profiles.length > 1 ? () => { setSelectedProfile(null); setGate("choosing"); } : undefined}
      onUnlock={() => { resumeProfileRequests(); return activateCurrentProfile(profiles.length > 1 ? "select" : "preserve"); }}
      profile={selectedProfile}
    />;
  } else if (activeProfile) {
    content = onboardingRequired && !navlessScreens.has(screen) ? <Navigate replace to="/onboarding" /> : (
      <ProfileProvider key={activeProfile.id} profile={activeProfile}>
        {headerScreens.has(screen) && <AppHeader onSwitch={() => void switchProfile()} />}
        <main><AppRoutes /></main>
        {!navlessScreens.has(screen) && !sessionActive && <BottomNav />}
      </ProfileProvider>
    );
  } else {
    content = <main><p>프로필 확인 중…</p></main>;
  }

  return <div className="app" data-theme={theme} style={themes[theme].cssVariables as CSSProperties}>{content}</div>;
}
