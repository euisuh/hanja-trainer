import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ platform: "web", values: new Map<string, string>() }));
const preferences = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
const haptics = vi.hoisted(() => ({ impact: vi.fn(async () => undefined), notification: vi.fn(async () => undefined) }));
const app = vi.hoisted(() => ({ listeners: new Map<string, (event: unknown) => void>(), removed: [] as string[] }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.platform !== "web", getPlatform: () => native.platform } }));
vi.mock("@capacitor/preferences", () => ({ Preferences: preferences }));
vi.mock("@capacitor/haptics", () => ({ Haptics: haptics, ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" }, NotificationType: { Error: "ERROR" } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (name: string, listener: (event: unknown) => void) => {
      app.listeners.set(name, listener);
      return { remove: async () => { app.removed.push(name); } };
    }),
  },
}));

const TOKEN_KEY = "hanja-trainer:session-token";

beforeEach(() => {
  vi.resetModules();
  native.platform = "web";
  native.values.clear();
  app.listeners.clear();
  app.removed.length = 0;
  preferences.get.mockImplementation(async ({ key }) => ({ value: native.values.get(key) ?? null }));
  preferences.set.mockImplementation(async ({ key, value }) => { native.values.set(key, value); });
  preferences.remove.mockImplementation(async ({ key }) => { native.values.delete(key); });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("haptics", () => {
  it("uses the native haptic engine for each cue", async () => {
    native.platform = "ios";
    const { buzz } = await import("./haptics");
    buzz("correct");
    buzz("skip");
    buzz("combo");
    buzz("wrong");
    expect(haptics.impact.mock.calls).toEqual([[{ style: "LIGHT" }], [{ style: "LIGHT" }], [{ style: "MEDIUM" }]]);
    expect(haptics.notification).toHaveBeenCalledWith({ type: "ERROR" });
  });

  it("keeps the browser vibration patterns", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { buzz } = await import("./haptics");
    buzz("wrong");
    buzz("correct");
    expect(vibrate.mock.calls).toEqual([[[30, 50, 30]], [18]]);
    expect(haptics.impact).not.toHaveBeenCalled();
  });
});

describe("app lifecycle", () => {
  it("flushes on native foreground only and removes the listener", async () => {
    native.platform = "android";
    const { onAppResume } = await import("./lifecycle");
    const resumed = vi.fn();
    const stop = onAppResume(resumed);
    await vi.waitFor(() => expect(app.listeners.has("appStateChange")).toBe(true));
    app.listeners.get("appStateChange")!({ isActive: false });
    app.listeners.get("appStateChange")!({ isActive: true });
    expect(resumed).toHaveBeenCalledTimes(1);
    stop();
    await vi.waitFor(() => expect(app.removed).toEqual(["appStateChange"]));
  });

  it("uses visibility in browsers", async () => {
    const target = new EventTarget();
    const document = Object.assign(target, { visibilityState: "hidden" });
    vi.stubGlobal("document", document);
    const { onAppResume } = await import("./lifecycle");
    const resumed = vi.fn();
    const stop = onAppResume(resumed);
    document.dispatchEvent(new Event("visibilitychange"));
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    stop();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it("intercepts the back button only on Android", async () => {
    native.platform = "ios";
    const { onBackButton } = await import("./lifecycle");
    onBackButton(vi.fn())();
    expect(app.listeners.has("backButton")).toBe(false);

    native.platform = "android";
    const back = vi.fn();
    const stop = onBackButton(back);
    await vi.waitFor(() => expect(app.listeners.has("backButton")).toBe(true));
    app.listeners.get("backButton")!({ canGoBack: true });
    expect(back).toHaveBeenCalledTimes(1);
    stop();
    await vi.waitFor(() => expect(app.removed).toEqual(["backButton"]));
  });
});

describe("native session token persistence", () => {
  const now = 1_800_000_000_000;
  const valid = `2.${now + 60_000}.signature`;

  it("restores an unexpired token and drops an expired one", async () => {
    native.platform = "ios";
    native.values.set(TOKEN_KEY, valid);
    let session = await import("./sessionToken");
    await session.loadSessionToken(now);
    expect(session.getSessionToken()).toBe(valid);

    vi.resetModules();
    native.values.set(TOKEN_KEY, `2.${now}.signature`);
    session = await import("./sessionToken");
    await session.loadSessionToken(now);
    expect(session.getSessionToken()).toBeNull();
    await vi.waitFor(() => expect(native.values.has(TOKEN_KEY)).toBe(false));
  });

  it("does not let a restored token overwrite a newer sign-in", async () => {
    native.platform = "android";
    native.values.set(TOKEN_KEY, valid);
    let resolveGet!: (value: { value: string | null }) => void;
    preferences.get.mockImplementationOnce(() => new Promise((resolve) => { resolveGet = resolve; }));
    const session = await import("./sessionToken");
    const loading = session.loadSessionToken(now);
    session.setSessionToken("2.999.fresh");
    resolveGet({ value: valid });
    await loading;
    expect(session.getSessionToken()).toBe("2.999.fresh");
  });

  it("does not let a slow saved-session load undo a later sign-out", async () => {
    native.platform = "ios";
    native.values.set(TOKEN_KEY, valid);
    let resolveGet!: (value: { value: string | null }) => void;
    preferences.get.mockImplementationOnce(() => new Promise((resolve) => { resolveGet = resolve; }));
    const session = await import("./sessionToken");
    const loading = session.loadSessionToken(now);
    session.setSessionToken("2.999.signed-in");
    session.setSessionToken(null);
    resolveGet({ value: valid });
    await loading;
    expect(session.getSessionToken()).toBeNull();
  });

  it("lets only the first of overlapping saved-session loads apply", async () => {
    native.platform = "ios";
    const reads: Array<(value: { value: string | null }) => void> = [];
    preferences.get.mockImplementation(() => new Promise((resolve) => { reads.push(resolve); }));
    const session = await import("./sessionToken");
    const first = session.loadSessionToken(now);
    const second = session.loadSessionToken(now);
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    reads[0]({ value: valid });
    reads[1]({ value: `2.${now}.expired` });
    await Promise.all([first, second]);
    expect(session.getSessionToken()).toBe(valid);
    expect(preferences.remove).not.toHaveBeenCalled();
  });

  it("writes renewals and sign-out in order", async () => {
    native.platform = "ios";
    let releaseFirst!: () => void;
    preferences.set.mockImplementationOnce(({ key, value }) => new Promise<void>((resolve) => { releaseFirst = () => { native.values.set(key, value); resolve(); }; }));
    const session = await import("./sessionToken");
    session.setSessionToken("1.1.first");
    session.renewSessionToken("1.1.first", "1.2.renewed");
    session.setSessionToken(null);
    await vi.waitFor(() => expect(preferences.set).toHaveBeenCalledTimes(1));
    releaseFirst();
    await vi.waitFor(() => expect(preferences.remove).toHaveBeenCalledTimes(1));
    expect(preferences.set.mock.calls.map(([call]) => call.value)).toEqual(["1.1.first", "1.2.renewed"]);
    expect(native.values.has(TOKEN_KEY)).toBe(false);
  });

  it("discards only the token the server rejected", async () => {
    const session = await import("./sessionToken");
    session.setSessionToken("1.1.current");
    session.discardSessionToken("1.1.stale");
    expect(session.getSessionToken()).toBe("1.1.current");
    session.discardSessionToken("1.1.current");
    expect(session.getSessionToken()).toBeNull();
  });

  it("never touches native storage in browsers", async () => {
    const session = await import("./sessionToken");
    session.setSessionToken("1.1.web");
    await session.loadSessionToken(now);
    expect(preferences.set).not.toHaveBeenCalled();
    expect(preferences.get).not.toHaveBeenCalled();
  });
});
