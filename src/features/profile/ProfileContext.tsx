import { createContext, useContext, type ReactNode } from "react";

export type ActiveProfile = { id: number; name: string; isAdmin: boolean; isGuest?: boolean };

const ProfileContext = createContext<ActiveProfile | null>(null);

export function ProfileProvider({ profile, children }: { profile: ActiveProfile; children: ReactNode }) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useActiveProfile(): ActiveProfile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("ProfileProvider is missing");
  return profile;
}
