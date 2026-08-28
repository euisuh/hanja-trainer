import { useLocation, useNavigate } from "react-router-dom";
import type { SessionResult } from "../features/session/SessionRunner";
import { SessionComplete } from "./SessionComplete";

const emptyResult: SessionResult = { xp: 0, accuracy: 0, bestCombo: 0, nextReview: "—" };

export function SessionCompleteScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  return <SessionComplete onHome={() => navigate("/home")} result={(location.state as SessionResult | null) ?? emptyResult} />;
}
