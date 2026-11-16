import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Canvas, createCanvas, Image, ImageData, loadImage } from "@napi-rs/canvas";
import type { Project, RasterLayer, TextLayer } from "../../core/types";
import { defaultEffects, historyReducer } from "../graphic-editor/model";
import { ProjectRenderer } from "../graphic-editor/render";

// Run production image code against a real raster canvas without a browser/UI.
// This verifies pixels and files, not browser layout, pointer events or worker scheduling.
class OffscreenCanvasAdapter {
  canvas: Canvas;
  constructor(width: number, height: number) { this.canvas = createCanvas(width, height); }
  getContext() { return this.canvas.getContext("2d"); }
  async convertToBlob() { return new Blob([new Uint8Array(await this.canvas.encode("png"))], { type: "image/png" }); }
}
type Done = { type: "done"; blob: Blob; maskBlob?: Blob; width: number; height: number };
type WorkerMessage = Done | { type: "progress"; progress: number } | { type: "error"; message: string };
const messages: WorkerMessage[] = [];
const workerScope = { postMessage: (message: WorkerMessage) => messages.push(message), onmessage: undefined as undefined | ((event: { data: unknown }) => Promise<void>) };

beforeAll(async () => {
  vi.stubGlobal("Image", Image); vi.stubGlobal("ImageData", ImageData);
  vi.stubGlobal("OffscreenCanvas", OffscreenCanvasAdapter);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => Object.assign(await loadImage(new Uint8Array(await blob.arrayBuffer())), { close() {} }));
  vi.stubGlobal("self", workerScope);
  vi.stubGlobal("document", { createElement: () => {
    const canvas = createCanvas(1, 1);
    return Object.assign(canvas, { toBlob(callback: (blob: Blob) => void) { void canvas.encode("png").then(data => callback(new Blob([new Uint8Array(data)], { type: "image/png" }))); } });
  } });
  await import("./quality.worker");
});
afterAll(() => vi.unstubAllGlobals());

function fixture() {
  const canvas = createCanvas(48, 32), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#b7ec55"; ctx.fillRect(8, 8, 32, 16);
  ctx.fillStyle = "#121212"; ctx.fillRect(20, 10, 5, 12);
  const mask = createCanvas(48, 32), maskCtx = mask.getContext("2d");
  maskCtx.fillStyle = "white"; maskCtx.fillRect(0, 0, 24, 32);
  return { source: canvas.toDataURL("image/png"), mask: mask.toDataURL("image/png") };
}
const asUrl = async (blob: Blob) => `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))}`;
function layer(source: string, mask: string): RasterLayer {
  return { id: "image", name: "Image", kind: "image", source, mask, pixelWidth: 48, pixelHeight: 32, width: 48, height: 32, x: 24, y: 16, rotation: 0, locked: false, visible: true, opacity: 1, effects: { ...defaultEffects } };
}
const makeProject = (image: RasterLayer): Project => ({ id: "test", name: "Test", updatedAt: "", dpi: 300, width: image.pixelWidth, height: image.pixelHeight, layers: [image] });

describe("quality processing and document output", () => {
  it("conserva los detalles de un píxel al exportar originales de más de 4096 px", async () => {
    const source = createCanvas(5000, 4), ctx = source.getContext("2d");
    for (let x = 0; x < 5000; x++) { ctx.fillStyle = x % 2 ? "#0000ff" : "#ff0000"; ctx.fillRect(x, 0, 1, 4); }
    const image: RasterLayer = { ...layer(source.toDataURL("image/png"), ""), pixelWidth: 5000, pixelHeight: 4, width: 5000, height: 4, x: 2500, y: 2 };
    const png = await new ProjectRenderer().exportPng(makeProject(image));
    const decoded = await loadImage(new Uint8Array(await png.arrayBuffer())), output = createCanvas(5000, 4), out = output.getContext("2d");
    out.drawImage(decoded, 0, 0);
    expect(out.getImageData(0, 0, 5000, 4).data).toEqual(ctx.getImageData(0, 0, 5000, 4).data);
  });
  it("runs source → upscale → sharpen → PNG → mask → export → undo without changing the physical size", async () => {
    messages.length = 0;
    const input = fixture();
    await workerScope.onmessage!({ data: { ...input, size: "2x", strength: 35 } });
    const result = messages.at(-1)!;
    expect(result.type).toBe("done"); if (result.type !== "done") throw new Error(JSON.stringify(result));
    expect([result.width, result.height]).toEqual([96, 64]); expect(result.maskBlob).toBeDefined();
    const [source, mask] = await Promise.all([asUrl(result.blob), asUrl(result.maskBlob!)]);
    const original = layer(input.source, input.mask), improved = { ...original, source, mask, pixelWidth: result.width, pixelHeight: result.height };
    expect([improved.x, improved.y, improved.width, improved.height]).toEqual([original.x, original.y, original.width, original.height]);
    const project = makeProject(original);
    let history = historyReducer({ present: project, past: [], future: [] }, { type: "commit", project: { ...project, layers: [improved] } });
    const exported = await new ProjectRenderer().exportPng({ ...makeProject(improved), layers: [{ ...improved, width: 96, height: 64, x: 48, y: 32 }] });
    const image = await loadImage(new Uint8Array(await exported.arrayBuffer())); expect([image.width, image.height]).toEqual([96, 64]);
    const canvas = createCanvas(96, 64), ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    expect(ctx.getImageData(2, 2, 1, 1).data[3]).toBe(0); // Original transparent margin.
    expect(ctx.getImageData(70, 30, 1, 1).data[3]).toBe(0); // Masked right half.
    expect(ctx.getImageData(25, 30, 1, 1).data[3]).toBe(255);
    history = historyReducer(history, { type: "undo" }); expect(history.present.layers[0]).toEqual(original);
    history = historyReducer(history, { type: "redo" }); expect(history.present.layers[0]).toEqual(improved);
  });
  it("produces a real 4096-pixel PNG and reports progress", async () => {
    messages.length = 0;
    await workerScope.onmessage!({ data: { ...fixture(), mask: "", size: "4k", strength: 35 } });
    const result = messages.at(-1)!;
    expect(result.type).toBe("done"); if (result.type !== "done") throw new Error(JSON.stringify(result));
    const image = await loadImage(new Uint8Array(await result.blob.arrayBuffer()));
    expect([image.width, image.height]).toEqual([4096, 2731]);
    const progress = messages.filter(message => message.type === "progress").map(message => message.progress);
    expect(progress.length).toBeGreaterThan(10);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  }, 30000);
  it("exports a sharpened PNG at the original dimensions", async () => {
    messages.length = 0;
    await workerScope.onmessage!({ data: { ...fixture(), mask: "", size: "original", strength: 35 } });
    const result = messages.at(-1)!;
    if (result.type !== "done") throw new Error(JSON.stringify(result));
    const image = await loadImage(new Uint8Array(await result.blob.arrayBuffer()));
    expect([image.width, image.height]).toEqual([48, 32]);
  });
  it("returns a recoverable error for an unreadable source", async () => {
    messages.length = 0;
    await workerScope.onmessage!({ data: { source: "data:image/png;base64,aW52YWxpZA==", mask: "", size: "4k", strength: 35 } });
    expect(messages.at(-1)?.type).toBe("error");
  });
  it("produces a genuine 8K PNG with the requested proportions", async () => {
    const canvas = createCanvas(128, 2), ctx = canvas.getContext("2d"); ctx.fillStyle = "#b7ec55"; ctx.fillRect(0, 0, 128, 2);
    messages.length = 0;
    await workerScope.onmessage!({ data: { source: canvas.toDataURL("image/png"), mask: "", size: "8k", strength: 35 } });
    const result = messages.at(-1)!;
    if (result.type !== "done") throw new Error(JSON.stringify(result));
    const image = await loadImage(new Uint8Array(await result.blob.arrayBuffer()));
    expect([image.width, image.height]).toEqual([7680, 120]);
  }, 30000);
  it("shares the complete composition between editor rendering and PNG export, including text and masks", async () => {
    const { source, mask } = fixture(), image = layer(source, mask);
    const text: TextLayer = { id: "text", kind: "text", name: "Text", text: "TEST", fontFamily: "Arial", bold: true, italic: false, color: "#ff0000", align: "center", x: 24, y: 26, width: 35, height: 9, rotation: 0, opacity: 1, visible: true, locked: false, effects: { ...defaultEffects } };
    const project = { ...makeProject(image), layers: [image, text] }, renderer = new ProjectRenderer();
    const preview = await renderer.render(project, 2048, true);
    const previewPixels = preview.getContext("2d")!.getImageData(0, 0, 48, 32).data;
    const png = await renderer.exportPng(project), rendered = await loadImage(new Uint8Array(await png.arrayBuffer()));
    const decoded = createCanvas(48, 32), ctx = decoded.getContext("2d"); ctx.drawImage(rendered, 0, 0);
    expect(ctx.getImageData(0, 0, 48, 32).data).toEqual(previewPixels);
    expect([...previewPixels].some((value, i) => i % 4 === 0 && value > 200 && previewPixels[i + 1] < 50)).toBe(true); // Red text was rendered.
    expect(previewPixels[3]).toBe(0);
    const muted = await renderer.render({ ...project, layers: [image, { ...text, visible: false }] }, 2048, true);
    expect(muted.getContext("2d")!.getImageData(0, 0, 48, 32).data).not.toEqual(previewPixels);
  });
});
