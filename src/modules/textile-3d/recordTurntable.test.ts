// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { recordTurntable, supportedVideoFormats } from "./recordTurntable";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([1080, 2160])("records a high-quality %ip turn and restores the view and media stream", async resolution => {
  const stopTrack = vi.fn();
  const canvas = document.createElement("canvas");
  canvas.width = resolution / 9 * 16; canvas.height = resolution;
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
  class Recorder {
    constructor(_stream: MediaStream, options: MediaRecorderOptions) { expect(options.videoBitsPerSecond).toBe(resolution === 1080 ? 15_552_000 : 62_208_000); }
    static isTypeSupported = () => true;
    state = "inactive"; mimeType = "video/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["video"]) }); this.onstop?.(); }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  let tick: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const view = { canvas, rotate: vi.fn(), restore: vi.fn() };
  const progress = vi.fn();
  const result = recordTurntable(view, "video/webm", 5, new AbortController().signal, progress);
  tick(3500); tick(6000);
  expect((await result).size).toBe(5);
  expect(view.rotate.mock.calls.map(call => call[0])).toEqual([0, 0.5, 1]);
  expect(progress).toHaveBeenLastCalledWith(1);
  expect(view.restore).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(canvas.captureStream).toHaveBeenCalledWith(30);
});

it("reports no available formats when recording is unsupported", () => {
  vi.stubGlobal("MediaRecorder", undefined);
  expect(supportedVideoFormats()).toEqual([]);
});

it("restores the view and stops the stream when cancelled", async () => {
  const stopTrack = vi.fn();
  const canvas = document.createElement("canvas");
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
  class Recorder { state = "inactive"; start() { this.state = "recording"; } stop() { this.state = "inactive"; } }
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const view = { canvas, rotate: vi.fn(), restore: vi.fn() };
  const controller = new AbortController();
  const result = recordTurntable(view, "video/webm", 5, controller.signal, vi.fn());
  controller.abort();
  await expect(result).rejects.toThrow("Grabación cancelada");
  expect(view.restore).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
});
