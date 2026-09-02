import { describe, expect, it, vi } from "vitest";
import { audioObjectKey, serveAudio } from "./audio";

function bucketWith(body: string | null): R2Bucket {
  const object = body === null ? null : Object.assign(Object.create(null) as R2ObjectBody, {
    body: new Blob([body]).stream(),
    httpEtag: '"audio-etag"',
    writeHttpMetadata(headers: Headers) { headers.set("content-type", "audio/mpeg"); },
  });
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

  it("streams cached audio metadata and returns misses", async () => {
    const bucket = bucketWith("audio");
    const response = await serveAudio(new Request("https://example.com/api/audio/jp/%E4%B8%80.mp3"), bucket);
    expect(await response.text()).toBe("audio");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("etag")).toBe('"audio-etag"');
    const head = await serveAudio(new Request("https://example.com/api/audio/jp/%E4%B8%80.mp3", { method: "HEAD" }), bucket);
    expect(head.status).toBe(200);
    expect(bucket.head).toHaveBeenCalledWith("jp/一.mp3");
    expect((await serveAudio(new Request("https://example.com/api/audio/cn/%E7%88%B1.mp3"), bucketWith(null))).status).toBe(404);
  });
});
