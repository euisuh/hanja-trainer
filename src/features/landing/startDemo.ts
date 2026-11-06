import { apiClient, resumeProfileRequests } from "../../lib/apiClient";

/**
 * Continues as a guest (POST /api/demo/session): resumes this browser's guest
 * profile if it is still valid, otherwise creates one. Keeps the session the way
 * sign-in does (cookie on web, token on native), then activates it. Guests are
 * created onboarded with the Japanese track, so `activate` ("select") lands on Home.
 */
export async function startDemo(activate: () => Promise<void>): Promise<void> {
  await apiClient.startDemo();
  resumeProfileRequests();
  await activate();
}
