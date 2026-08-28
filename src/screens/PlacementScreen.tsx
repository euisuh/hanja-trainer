import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadOnboardingProfile, savePlacementResults } from "../features/onboarding/tracks";
import { SessionRunner } from "../features/session/SessionRunner";
import { demoCharacters } from "../features/session/demoData";

export function PlacementScreen() {
  const navigate = useNavigate();
  const enabledTracks = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  return (
    <SessionRunner
      characters={demoCharacters}
      enabledTracks={enabledTracks}
      mode="placement"
      onComplete={(result) => {
        savePlacementResults(result.placement ?? []);
        navigate("/placement-result");
      }}
      onQuit={() => navigate("/onboarding")}
    />
  );
}
