import { routeApiRequest } from "./api/router";

export default {
  fetch(request, env): Response | Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return routeApiRequest(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
