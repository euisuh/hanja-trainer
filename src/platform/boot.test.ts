import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Separate file: these boots must not import the App mock in storage.test.ts, which asserts
// that the restore finished first.
const preferences = vi.hoisted(() => ({ keys: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
const render = vi.hoisted(() => vi.fn());
const appImport = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }));
vi.mock("@capacitor/preferences", () => ({ Preferences: preferences }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render }) }));
vi.mock("../App", () => { appImport(); return { App: () => null }; });

const reviews = "hanja-trainer:pending-reviews:entry:";
let values: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  values = new Map();
  vi.stubGlobal("localStorage", {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  });
  vi.stubGlobal("document", { getElementById: () => ({}) });
  preferences.set.mockResolvedValue(undefined);
  preferences.remove.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders after the restore timeout and never writes behind the app afterwards", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  let finishKeys!: (value: { keys: string[] }) => void;
  preferences.keys.mockImplementationOnce(() => new Promise((resolve) => { finishKeys = resolve; }));
  preferences.get.mockImplementation(async ({ key }) => ({ value: key === `${reviews}late` ? "late" : null }));

  await import("../main");
  await vi.advanceTimersByTimeAsync(1_999);
  expect(render).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  expect(appImport).toHaveBeenCalledOnce();
  expect(warning).toHaveBeenCalledWith("Native offline storage restore timed out; continuing without it.");

  finishKeys({ keys: [`${reviews}late`] });
  await vi.advanceTimersByTimeAsync(10);
  expect(values.has(`${reviews}late`)).toBe(false);
  expect(preferences.set).not.toHaveBeenCalled();
});

it("renders even when the saved session never loads", async () => {
  preferences.get.mockImplementation(() => new Promise(() => undefined));
  preferences.keys.mockResolvedValue({ keys: [] });
  await import("../main");
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
});
