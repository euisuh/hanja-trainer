import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { matchPath, Navigate, useLocation, useNavigate } from "react-router-dom";
import { cssVariables } from "./design/tokens";
import { Landing } from "./features/landing/Landing";
import { startDemo } from "./features/landing/startDemo";
import { ProfileProvider, type ActiveProfile } from "./features/profile/ProfileContext";
import { ReviewSyncStatus } from "./features/session/ReviewSyncStatus";
import { SessionSummaryStatus } from "./features/session/SessionSummaryStatus";
import { setAnswerSubmitProfile } from "./features/session/useAnswerSubmit";
import { setSessionSummaryProfile } from "./features/session/useSessionSummary";
import { setConversationAttemptProfile } from "./features/conversation/attemptOutbox";
import { ConversationAttemptSync } from "./features/conversation/ConversationAttemptSync";
import { resetSettingsClientState } from "./features/settings/useSettings";
import { ApiClientError, ONBOARDING_COMPLETED_EVENT, PIN_REQUIRED_EVENT, apiClient, pauseProfileRequests, resumeProfileRequests, setApiProfileId } from "./lib/apiClient";
import { nativeShell, needsExplicitSelection, setSessionToken } from "./platform/sessionToken";
import { AppRoutes, routes, type Screen } from "./routes";
import { ProfilePicker } from "./screens/ProfilePicker";
import { UnlockScreen } from "./screens/UnlockScreen";
import { clientUpdateRequired, type ProfileResponse, type PublicProfile } from "../shared/api";
import { AppHeader } from "./shell/AppHeader";
import { BottomNav } from "./shell/BottomNav";
import { useGlobalHotkeys } from "./shell/useGlobalHotkeys";
// Global overrides must follow screen styles, including after native boot restore.
import "./design/animations.css";
import "./styles.css";

const headerScreens = new Set<Screen>(["home", "review", "stats", "settings", "detail", "study", "about"]);
const navlessScreens = new Set<Screen>(["onboarding", "placement", "placement-result"]);
const sessionScreens = new Set<Screen>(["placement", "lesson", "review-session", "session-complete", "speaking", "talk", "talk-home", "talk-contents", "talk-diary"]);

type Gate = "checking" | "error" | "update" | "choosing" | "locked" | "unlocked";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection is an untyped I/O boundary.
function isProfileRequired(caught: unknown): boolean {
  return caught instanceof ApiClientError && (caught.code === "pin_required" || caught.code === "profile_required" || caught.code === "profile_changed");
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
  // Visitors with no stored session see the landing page before the profile picker.
  const [landing, setLanding] = useState(false);
  const screen = routes.find((route) => matchPath({ path: route.path, end: true }, pathname))?.screen ?? "onboarding";
  const screenRef = useRef(screen);
  const sessionActive = sessionScreens.has(screen);

  useGlobalHotkeys({ sessionActive, modalOpen: gate !== "unlocked" });

  useEffect(() => {
    navigateRef.current = navigate;
    screenRef.current = screen;
  }, [navigate, screen]);

  const teardownActiveProfile = useCallback(() => {
    setApiProfileId(null);
    setSessionToken(null);
    setAnswerSubmitProfile(null);
    setSessionSummaryProfile(null);
    setConversationAttemptProfile(null);
    resetSettingsClientState();
    setActiveProfile(null);
    setGate("checking");
  }, []);

  const activateCurrentProfile = useCallback(async (mode: "preserve" | "select" | "guard", signal?: AbortSignal) => {
    const profile = await apiClient.profile(signal, false, null);
    setApiProfileId(profile.id);
    let onboarding;
    try {
      onboarding = await apiClient.onboardingState(signal, false);
    } catch (caught) {
      setApiProfileId(null);
      throw caught;
    }
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
      if (needsExplicitSelection(onlyProfile)) await apiClient.selectProfile(onlyProfile.id);
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
      if (nativeShell()) {
        const config = await apiClient.clientConfig(controller.signal).catch(() => null);
        if (controller.signal.aborted) return;
        if (clientUpdateRequired(config)) {
          setGate("update");
          return;
        }
      }
      try {
        const result = await apiClient.profiles(controller.signal);
        if (controller.signal.aborted) return;
        setProfiles(result.profiles);
        if (result.profiles.length !== 1) {
          try {
            await activateCurrentProfile("guard", controller.signal);
          } catch (caught) {
            if (controller.signal.aborted) return;
            const choosing = isProfileRequired(caught);
            setLanding(choosing);
            setGate(choosing ? "choosing" : "error");
          }
          return;
        }

        const onlyProfile = result.profiles[0];
        setSelectedProfile(onlyProfile);
        const state = await apiClient.pinState(controller.signal);
        setLockedUntil(state.lockedUntil);
        try {
          if (needsExplicitSelection(onlyProfile)) await apiClient.selectProfile(onlyProfile.id);
          await activateCurrentProfile("preserve", controller.signal);
        } catch (caught) {
          if (controller.signal.aborted) return;
          // Anonymous visitors see one nameless admin entry, so the landing page fronts the lock screen too.
          const locked = isProfileRequired(caught) && state.enabled;
          setLanding(locked);
          setGate(locked ? "locked" : "error");
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
    setSessionSummaryProfile(activeProfile?.id ?? null);
    setConversationAttemptProfile(activeProfile?.id ?? null);
    if (!activeProfile) resetSettingsClientState();
  }, [activeProfile]);

  useEffect(() => {
    const completeOnboarding = () => setOnboardingRequired(false);
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, completeOnboarding);
    return () => window.removeEventListener(ONBOARDING_COMPLETED_EVENT, completeOnboarding);
  }, []);

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

  const tryDemo = () => startDemo(() => activateCurrentProfile("select"));

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
  } else if (gate === "update") {
    content = <main className="session-empty"><p role="alert">새 버전이 필요합니다. 스토어에서 앱을 업데이트해 주세요.</p></main>;
  } else if (gate === "error") {
    content = <main className="session-empty">
      <p role="alert">연결 상태를 확인하지 못했습니다.</p>
      <button onClick={() => { setGate("checking"); setRetryKey((value) => value + 1); }} type="button">다시 시도</button>
    </main>;
  } else if (gate === "choosing") {
    content = landing && pathname === "/" ? <Landing onDemo={tryDemo} onSignIn={() => setLanding(false)} /> : <ProfilePicker onDemo={tryDemo} onSelect={selectProfile} profiles={profiles} />;
  } else if (gate === "locked" && selectedProfile && landing && pathname === "/") {
    content = <Landing onDemo={tryDemo} onSignIn={() => setLanding(false)} />;
  } else if (gate === "locked" && selectedProfile) {
    content = <UnlockScreen
      key={selectedProfile.id}
      lockedUntil={lockedUntil}
      onBack={profiles.length > 1 ? () => { setSelectedProfile(null); setGate("choosing"); } : undefined}
      onDemo={tryDemo}
      onUnlock={() => { resumeProfileRequests(); return activateCurrentProfile(profiles.length > 1 ? "select" : "preserve"); }}
      profile={selectedProfile}
    />;
  } else if (activeProfile) {
    content = onboardingRequired && !navlessScreens.has(screen) ? <Navigate replace to="/onboarding" /> : (
      <ProfileProvider key={activeProfile.id} profile={activeProfile}>
        {headerScreens.has(screen) && <AppHeader onSwitch={() => void switchProfile()} />}
        <ReviewSyncStatus />
        <SessionSummaryStatus />
        <ConversationAttemptSync />
        <main><AppRoutes /></main>
        {!navlessScreens.has(screen) && !sessionActive && <BottomNav />}
      </ProfileProvider>
    );
  } else {
    content = <main><p>프로필 확인 중…</p></main>;
  }

  // SAFETY: the token map is CSS custom-property declarations.
  return <div className="app" style={cssVariables as CSSProperties}>{content}</div>;
}
