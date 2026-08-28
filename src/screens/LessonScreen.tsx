import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { SessionRunner } from "../features/session/SessionRunner";
import { demoCharacters, loadDemoStates, persistDemoAnswer } from "../features/session/demoData";

export function LessonScreen() {
  const navigate = useNavigate();
  const states = useMemo(() => loadDemoStates(), []);
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  return (
    <SessionRunner
      characters={demoCharacters}
      enabledTracks={enabledTracks}
      initialReviewStates={states}
      mode="lesson"
      onComplete={(result) => navigate("/session-complete", { state: result })}
      onPersist={persistDemoAnswer}
      onQuit={() => navigate("/home")}
    />
  );
}
