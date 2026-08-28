import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SessionRunner } from "../features/session/SessionRunner";
import { demoCharacters, loadDemoStates, persistDemoAnswer } from "../features/session/demoData";
const enabledTracks = ["kr", "jp", "cn"] as const;

export function LessonScreen() {
  const navigate = useNavigate();
  const states = useMemo(() => loadDemoStates(), []);
  return (
    <SessionRunner
      characters={demoCharacters}
      enabledTracks={[...enabledTracks]}
      initialReviewStates={states}
      mode="lesson"
      onComplete={(result) => navigate("/session-complete", { state: result })}
      onPersist={persistDemoAnswer}
      onQuit={() => navigate("/home")}
    />
  );
}
