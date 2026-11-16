// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { installTestCanvas } from "../graphic-editor/testCanvas";
import { ProjectRenderer, loadImage } from "../graphic-editor/render";
import { defaultEffects } from "../graphic-editor/model";
import { defaultHalftoneOptions } from "./halftone";
import type { Project, RasterLayer } from "../../core/types";
beforeEach(() => { installTestCanvas(); vi.stubGlobal("Worker", undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const canvas = createCanvas(100, 100), ctx = canvas.getContext("2d"); ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 100, 100);
  const layer: RasterLayer = { id: "screen", kind: "image", name: "Screen", source: canvas.toDataURL("image/png"), mask: "", pixelWidth: 100, pixelHeight: 100, x: 150, y: 150, width: 300, height: 300, rotation: 0, visible: true, locked: false, opacity: 1, effects: { ...defaultEffects, halftone: true, halftoneOptions: { ...defaultHalftoneOptions, unit: "lpi", lpi: 30 } } };
  const project: Project = { id: "p", name: "P", width: 300, height: 300, dpi: 300, updatedAt: "", layers: [layer] };
  return { canvas, ctx, layer, project };
}
describe("screen rendering and export", () => {
  it("uses the exact same processed resource for preview, export and 3D compositions", async () => {
    const { project } = fixture(), renderer = new ProjectRenderer();
    const preview = await renderer.prepare(project), exported = await renderer.prepare(project, true);
    expect(preview.get("screen")).toBe(exported.get("screen")); expect(preview.get("screen")!.width).toBe(300);
    const first = await renderer.render(project, 2048, true), png = await renderer.exportPng(project);
    const bytes = new Uint8Array(await png.arrayBuffer()), decoded = await loadImage(`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`);
    const compare = document.createElement("canvas"); compare.width = 300; compare.height = 300; compare.getContext("2d")!.drawImage(decoded, 0, 0);
    expect(compare.getContext("2d")!.getImageData(0, 0, 300, 300).data).toEqual(first.getContext("2d")!.getImageData(0, 0, 300, 300).data);
  });
  it("applies the removal mask before tone averaging so erased colors cannot darken the remaining pixels", async () => {
    const { ctx, canvas, layer, project } = fixture(); ctx.fillStyle = "black"; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = "white"; ctx.fillRect(45, 0, 10, 100);
    const mask = createCanvas(100, 100), maskCtx = mask.getContext("2d"); maskCtx.fillStyle = "white"; maskCtx.fillRect(45, 0, 10, 100);
    const masked = { ...layer, source: canvas.toDataURL("image/png"), mask: mask.toDataURL("image/png"), width: 100, height: 100, x: 50, y: 50, effects: { ...defaultEffects, halftone: true, halftoneCell: 64 } };
    const output = await new ProjectRenderer().render({ ...project, width: 100, height: 100, layers: [masked] }, 2048);
    expect(output.getContext("2d")!.getImageData(0, 0, 100, 100).data.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
  });
  it("invalidates only the affected screen when cm or DPI change, and disabling restores the source", async () => {
    const { layer, project } = fixture(), renderer = new ProjectRenderer();
    const original = (await renderer.prepare(project)).get(layer.id)!;
    const shifted = await renderer.prepare({ ...project, layers: [{ ...layer, x: 180 }] }); expect(shifted.get(layer.id)).toBe(original);
    const resized = (await renderer.prepare({ ...project, layers: [{ ...layer, width: 600, height: 600 }] })).get(layer.id)!; expect(resized.width).toBe(600); expect(resized).not.toBe(original);
    const disabled = (await renderer.prepare({ ...project, layers: [{ ...layer, effects: { ...layer.effects, halftone: false } }] })).get(layer.id)!;
    expect([...disabled.getContext("2d")!.getImageData(50, 50, 1, 1).data]).toEqual([128, 128, 128, 255]);
  });
});
