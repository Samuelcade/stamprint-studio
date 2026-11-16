import { describe, expect, it } from "vitest";
import { defaultHalftoneOptions, renderHalftone, screenGeometry, ScreenSettings } from "./halftone";
import { defaultEffects, resizeDocument } from "../graphic-editor/model";
import type { RasterLayer } from "../../core/types";
const settings: ScreenSettings = { ...defaultHalftoneOptions, cellX: 20, cellY: 20 };
function fixture(gray: number, alpha = 255, width = 80, height = 80): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = gray; data[i + 3] = alpha; }
  return { width, height, data } as ImageData;
}
const coverage = (image: ImageData) => image.data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value / 255 : 0), 0) / (image.width * image.height);
describe("halftone screen pixels", () => {
  it("renders pure black as solid ink and white as transparency for every shape", () => {
    for (const shape of ["circle", "square", "line"] as const) {
      expect(coverage(renderHalftone(fixture(0), { ...settings, shape }))).toBe(1);
      expect(coverage(renderHalftone(fixture(255), { ...settings, shape }))).toBe(0);
    }
  });
  it("preserves tonal coverage through highlights, midtones and shadows", () => {
    for (const shape of ["circle", "square", "line"] as const) for (const gray of [32, 64, 128, 192, 224]) {
      const actual = coverage(renderHalftone(fixture(gray), { ...settings, shape }));
      expect(Math.abs(actual - (1 - gray / 255)), `${shape}, gray=${gray}`).toBeLessThan(.035);
    }
  });
  it("ignores RGB hidden under transparent pixels and never spreads alpha outside the source", () => {
    const a = fixture(128), b = fixture(128);
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (x % 20 < 7) {
      const i = (y * a.width + x) * 4;
      a.data.fill(0, i, i + 4); b.data[i] = b.data[i + 1] = b.data[i + 2] = 255; b.data[i + 3] = 0;
    }
    const first = renderHalftone(a, settings), second = renderHalftone(b, settings);
    expect(first.data).toEqual(second.data);
    for (let i = 3; i < a.data.length; i += 4) expect(first.data[i]).toBeLessThanOrEqual(a.data[i]);
    expect(coverage(renderHalftone(fixture(0, 128), settings))).toBeCloseTo(128 / 255);
    expect(coverage(renderHalftone(fixture(255, 128), settings))).toBe(0);
  });
  it("supports ink, inversion, angle and tonal intensity without changing the original", () => {
    const source = fixture(128), original = new Uint8ClampedArray(source.data);
    const normal = renderHalftone(source, settings), rotated = renderHalftone(source, { ...settings, angle: 45 });
    expect(normal.data).not.toEqual(rotated.data); expect(Math.abs(coverage(normal) - coverage(rotated))).toBeLessThan(.04);
    const colored = renderHalftone(fixture(255), { ...settings, ink: "#ff3300", invert: true }); expect([...colored.data.slice(0, 4)]).toEqual([255, 51, 0, 255]);
    expect(coverage(renderHalftone(source, { ...settings, gamma: 2 }))).toBeGreaterThan(coverage(normal)); expect(source.data).toEqual(original);
  });
  it("rejects impossible screen settings instead of freezing or silently changing frequency", () => {
    for (const cellX of [0, -.5, NaN, Infinity, .5]) expect(() => renderHalftone(fixture(128), { ...settings, cellX })).toThrow(/al menos 1/);
    expect(() => renderHalftone(fixture(128), { ...settings, ink: "invalid" })).toThrow();
    expect(() => renderHalftone(fixture(128), { ...settings, gamma: NaN })).toThrow();
  });
  it("keeps physical LPI after resizing the object and changing document DPI", () => {
    const layer: RasterLayer = { id: "a", kind: "image", name: "a", source: "", mask: "", pixelWidth: 600, pixelHeight: 400, x: 300, y: 200, width: 600, height: 400, rotation: 0, visible: true, locked: false, opacity: 1, effects: { ...defaultEffects, halftone: true, halftoneOptions: { ...defaultHalftoneOptions, unit: "lpi", lpi: 30 } } };
    const one = screenGeometry(layer, 300), larger = screenGeometry({ ...layer, width: 1200, height: 800 }, 300);
    expect(one.settings.cellX).toBe(10); expect(larger.settings.cellX).toBe(10);
    const resized = resizeDocument({ id: "doc", name: "Doc", dpi: 300, width: 600, height: 400, updatedAt: "", layers: [layer] }, 5.08, 3.3867, 600);
    const doubled = screenGeometry(resized.layers[0] as RasterLayer, 600);
    expect(doubled.settings.cellX).toBe(20); expect(one.width / one.settings.cellX).toBe(doubled.width / doubled.settings.cellX);
  });
});
