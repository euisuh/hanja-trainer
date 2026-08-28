export function routeApiRequest(request: Request): Response {
  const pathname = new URL(request.url).pathname;

  if (request.method === "GET" && pathname === "/api/health") {
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 404 });
}
