import { routeApiRequest } from "./api/router";
import { serveAudio } from "./audio";

export default {
  fetch(request, env): Response | Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/audio/")) return serveAudio(request, env.AUDIO);
    if (pathname.startsWith("/api/")) {
      return routeApiRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
