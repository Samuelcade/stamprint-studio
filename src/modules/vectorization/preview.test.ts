import { describe, expect, it } from "vitest";
import { previewLayout } from "./preview";
import { emptyVectorSession } from "./vector";
import { readVectorSession } from "./session";
describe("vector sizing and saved data", () => {
  it("fits both portrait and landscape drawings and scales continuously above and below 100%", () => {
    const viewport = { width: 600, height: 400 };
    for (const aspect of [.25, 1, 4]) {
      const fit = previewLayout(viewport, aspect, false, 1), smaller = previewLayout(viewport, aspect, false, .8), larger = previewLayout(viewport, aspect, false, 1.25);
      expect(fit.width).toBeLessThanOrEqual(552); expect(fit.height).toBeLessThanOrEqual(328);
      expect(smaller.width).toBeCloseTo(fit.width * .8); expect(larger.height).toBeCloseTo(fit.height * 1.25);
      expect(smaller.width / smaller.height).toBeCloseTo(aspect);
    }
  });
  it("fits equal-size comparison panels and creates scrolling space for enlarged artwork", () => {
    const viewport = { width: 600, height: 400 };
    const comparison = previewLayout(viewport, 1, true, 1); expect(comparison.width * 2 + 20 + 48).toBeLessThanOrEqual(600);
    const enlarged = previewLayout(viewport, 1, false, 8); expect(enlarged.spaceWidth).toBeGreaterThan(600); expect(enlarged.spaceHeight).toBeGreaterThan(400);
  });
  it("reads older sessions and rejects damaged results before they reach the editor", () => {
    expect(readVectorSession(emptyVectorSession()).name).toBe("Mi vector");
    expect(() => readVectorSession({ ...emptyVectorSession(), widthCm: NaN })).toThrow();
    expect(() => readVectorSession({ ...emptyVectorSession(), result: { width: 0, height: 10, paths: [] } })).toThrow();
    expect(() => readVectorSession({ ...emptyVectorSession(), options: { colors: 100 } })).toThrow();
    expect(() => readVectorSession({ ...emptyVectorSession(), result: { width: 10, height: 10, paths: [{ id: "x", color: "#ff0000", visible: true, contours: [[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: Infinity, y: 5 }]] }] } })).toThrow();
  });
});
