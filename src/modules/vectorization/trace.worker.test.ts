import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Canvas, createCanvas, loadImage } from "@napi-rs/canvas";
import { defaultTraceOptions, VectorResult } from "./vector";
class OffscreenCanvasAdapter {
  canvas: Canvas;
  constructor(public width: number, public height: number) { this.canvas = createCanvas(width, height); }
  getContext() { return this.canvas.getContext("2d"); }
}
type Message = { type: "done"; result: VectorResult } | { type: "error"; message: string } | { type: "progress"; progress: number; stage: string };
const messages: Message[] = [];
const scope = { onmessage: undefined as undefined | ((event: { data: unknown }) => Promise<void>), postMessage: (message: Message) => messages.push(message) };
beforeAll(async () => {
  vi.stubGlobal("self", scope); vi.stubGlobal("OffscreenCanvas", OffscreenCanvasAdapter);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => Object.assign(await loadImage(new Uint8Array(await blob.arrayBuffer())), { close() {} }));
  await import("./trace.worker");
});
afterAll(() => vi.unstubAllGlobals());
describe("trace worker pipeline", () => {
  it("decodes a PNG, reduces the analysis size, traces holes and returns progress without image data in its result", async () => {
    const canvas = createCanvas(1000, 600), ctx = canvas.getContext("2d"); ctx.fillStyle = "red"; ctx.fillRect(100, 100, 600, 400); ctx.clearRect(200, 200, 200, 200);
    messages.length = 0;
    await scope.onmessage!({ data: { source: canvas.toDataURL("image/png"), options: { ...defaultTraceOptions, resolution: 512 } } });
    const last = messages.at(-1)!; expect(last.type).toBe("done"); if (last.type !== "done") throw new Error(JSON.stringify(last));
    expect([last.result.width, last.result.height]).toEqual([512, 307]); expect(last.result.paths[0].contours).toHaveLength(2);
    expect(JSON.stringify(last.result)).not.toMatch(/base64|source|data:image/);
    const progress = messages.filter(message => message.type === "progress").map(message => message.progress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b)); expect(progress.at(-1)).toBe(100);
  });
  it("returns readable errors for corrupt or unsupported input", async () => {
    messages.length = 0; await scope.onmessage!({ data: { source: "data:image/png;base64,YmFk", options: defaultTraceOptions } }); expect(messages.at(-1)?.type).toBe("error");
    messages.length = 0; await scope.onmessage!({ data: { source: "https://example.com/image.png", options: defaultTraceOptions } }); expect(messages.at(-1)).toEqual({ type: "error", message: "Carga una imagen PNG, JPG o WebP." });
  });
  it("preserves detail beyond 1280 pixels when the 2048 setting is selected", async () => {
    const canvas = createCanvas(2048, 64), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(100, 10, 1800, 40);
    messages.length = 0;
    await scope.onmessage!({ data: { source: canvas.toDataURL("image/png"), options: { ...defaultTraceOptions, resolution: 2048 } } });
    const last = messages.at(-1)!;
    if (last.type !== "done") throw new Error(JSON.stringify(last));
    expect(last.result.width).toBe(2048); expect(last.result.height).toBe(64);
  });
});
