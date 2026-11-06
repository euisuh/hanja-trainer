import { apiClient, resumeProfileRequests } from "../../lib/apiClient";

/**
 * Creates a throwaway demo profile (POST /api/demo/session), keeps its session
 * the way sign-in does (cookie on web, token on native), then activates it.
 * Demo profiles are created onboarded with the Japanese track, so `activate`
 * ("select") lands on Home.
 */
export async function startDemo(activate: () => Promise<void>): Promise<void> {
  await apiClient.startDemo();
  resumeProfileRequests();
  await activate();
}
