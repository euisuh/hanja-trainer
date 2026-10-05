import { describe, expect, it, vi } from "vitest";
import { audioObjectKey, serveAudio } from "./audio";

function bucketWith(body: string | null): R2Bucket {
  // SAFETY: fixture has every R2ObjectBody member used by serveAudio.
  const object = body === null ? null : Object.assign(Object.create(null) as R2ObjectBody, {
    body: new Blob([body]).stream(),
    httpEtag: '"audio-etag"',
    writeHttpMetadata(headers: Headers) { headers.set("content-type", "audio/mpeg"); },
  });
  // SAFETY: fixture assigns both R2Bucket methods used by serveAudio.
  const bucket = Object.create(null) as R2Bucket;
  bucket.get = vi.fn(async () => object);
  bucket.head = vi.fn(async () => object);
  return bucket;
}

describe("cached audio route", () => {
  it("maps one encoded character to its track object", () => {
    expect(audioObjectKey("/api/audio/kr/%E6%A0%A1.mp3")).toBe("kr/校.mp3");
    expect(audioObjectKey("/api/audio/xx/%E6%A0%A1.mp3")).toBeNull();
    expect(audioObjectKey("/api/audio/kr/a%2Fb.mp3")).toBeNull();
  });

  it("maps a numbered sentence key to its track object", () => {
    expect(audioObjectKey("/api/audio/jp/s380195.mp3")).toBe("jp/s380195.mp3");
    expect(audioObjectKey("/api/audio/cn/s1.mp3")).toBe("cn/s1.mp3");
    expect(audioObjectKey("/api/audio/kr/s1.mp3")).toBe("kr/s1.mp3");
    expect(audioObjectKey("/api/audio/jp/s38%200195.mp3")).toBeNull();
    expect(audioObjectKey("/api/audio/jp/sabc.mp3")).toBeNull();
    expect(audioObjectKey("/api/audio/jp/s.mp3")).toBe("jp/s.mp3");
  });

  it("maps hashed conversation keys only for Japanese", () => {
    expect(audioObjectKey("/api/audio/jp/c/0123456789abcdef.mp3")).toBe("jp/c/0123456789abcdef.mp3");
    expect(audioObjectKey("/api/audio/cn/c/0123456789abcdef.mp3")).toBeNull();
    expect(audioObjectKey("/api/audio/jp/c/0123456789abcdeg.mp3")).toBeNull();
    expect(audioObjectKey("/api/audio/jp/c/0123456789abcde.mp3")).toBeNull();
  });

  it("streams cached audio metadata and returns misses", async () => {
    const bucket = bucketWith("audio");
    const response = await serveAudio(new Request("https://example.com/api/audio/jp/%E4%B8%80.mp3"), bucket);
    expect(await response.text()).toBe("audio");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("etag")).toBe('"audio-etag"');
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    const head = await serveAudio(new Request("https://example.com/api/audio/jp/%E4%B8%80.mp3", { method: "HEAD" }), bucket);
    expect(head.status).toBe(200);
    expect(bucket.head).toHaveBeenCalledWith("jp/一.mp3");
    expect((await serveAudio(new Request("https://example.com/api/audio/cn/%E7%88%B1.mp3"), bucketWith(null))).status).toBe(404);
  });

  it("marks hashed conversation clips immutable", async () => {
    const response = await serveAudio(new Request("https://example.com/api/audio/jp/c/0123456789abcdef.mp3"), bucketWith("audio"));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });
});
