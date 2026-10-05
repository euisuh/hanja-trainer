import { useEffect } from "react";
import { flushPendingConversationAttempts } from "./attemptOutbox";
import { useActiveProfile } from "../profile/ProfileContext";

export function ConversationAttemptSync() {
  const { id: profileId } = useActiveProfile();

  useEffect(() => {
    const flush = () => { void flushPendingConversationAttempts(profileId); };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [profileId]);

  return null;
}
