export function audioObjectKey(pathname: string): string | null {
  const match = pathname.match(/^\/api\/audio\/(kr|jp|cn)\/([^/]+)\.mp3$/u);
  if (!match) return null;
  try {
    const key = decodeURIComponent(match[2]);
    if (key.includes("/")) return null;
    const isCharacter = Array.from(key).length === 1;
    const isSentence = /^s\d+$/u.test(key);
    return isCharacter || isSentence ? `${match[1]}/${key}.mp3` : null;
  } catch {
    return null;
  }
}

function audioHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=86400");
  headers.set("etag", object.httpEtag);
  return headers;
}

export async function serveAudio(request: Request, bucket: R2Bucket): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = audioObjectKey(new URL(request.url).pathname);
  if (!key) return new Response("Invalid audio key", { status: 400 });
  if (request.method === "HEAD") {
    const object = await bucket.head(key);
    return object ? new Response(null, { headers: audioHeaders(object) }) : new Response("Not found", { status: 404 });
  }
  const object = await bucket.get(key);
  return object ? new Response(object.body, { headers: audioHeaders(object) }) : new Response("Not found", { status: 404 });
}
