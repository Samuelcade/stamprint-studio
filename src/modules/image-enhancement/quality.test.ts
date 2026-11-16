import { describe, expect, it } from "vitest";
import { qualityDimensions, sharpenImage, upscaleBicubic } from "./quality";

describe("quality dimensions", () => {
  it("preserves proportions for portrait, landscape and square 4K images", () => {
    expect(qualityDimensions(600, 900, "4k")).toEqual({ width: 2731, height: 4096 });
    expect(qualityDimensions(1920, 1080, "4k")).toEqual({ width: 4096, height: 2304 });
    expect(qualityDimensions(100, 100, "4k")).toEqual({ width: 4096, height: 4096 });
  });
  it("supports a proportional 8K output", () => {
    expect(qualityDimensions(1920, 1080, "8k")).toEqual({ width: 7680, height: 4320 });
    expect(qualityDimensions(500, 1000, "8k")).toEqual({ width: 3840, height: 7680 });
  });
  it("limits 2x to 4096 without stretching", () => {
    expect(qualityDimensions(3000, 1500, "2x")).toEqual({ width: 4096, height: 2048 });
    expect(qualityDimensions(600, 900, "2x")).toEqual({ width: 1200, height: 1800 });
    expect(qualityDimensions(600, 900, "original")).toEqual({ width: 600, height: 900 });
    expect(() => qualityDimensions(0, 900, "4k")).toThrow();
    expect(() => qualityDimensions(8192, 100, "4k")).toThrow();
  });
});

describe("bicubic interpolation and sharpening", () => {
  it("does not introduce colors from invisible pixels at transparent edges", () => {
    const input = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]) };
    const output = upscaleBicubic(input, 12, 6);
    for (let i = 0; i < output.data.length; i += 4) {
      if (output.data[i + 3]) {
        expect(output.data[i]).toBe(255); expect(output.data[i + 1]).toBe(0); expect(output.data[i + 2]).toBe(0);
      }
    }
    expect([...output.data].filter((_, i) => i % 4 === 3).some(a => a > 0 && a < 255)).toBe(true);
    expect(input.data).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]));
  });
  it("keeps flat colors and alpha stable through upscale and sharpen", () => {
    const input = { width: 1, height: 1, data: new Uint8ClampedArray([60, 140, 220, 120]) };
    const result = sharpenImage(upscaleBicubic(input, 10, 10), 100);
    for (let i = 0; i < result.data.length; i += 4) expect([...result.data.slice(i, i + 4)]).toEqual([60, 140, 220, 120]);
  });
  it("sharpens real edges while preserving alpha and limiting halos", () => {
    const input = { width: 5, height: 1, data: new Uint8ClampedArray([40,40,40,255, 80,80,80,255, 160,160,160,255, 200,200,200,255, 200,200,200,255]) };
    const result = sharpenImage(input, 100);
    expect(result.data[4]).toBeLessThan(input.data[4]);
    expect(result.data[8]).toBeGreaterThan(input.data[8]);
    for (let i = 0; i < result.data.length; i++) {
      if (i % 4 === 3) expect(result.data[i]).toBe(input.data[i]);
      else expect(Math.abs(result.data[i] - input.data[i])).toBeLessThanOrEqual(20);
    }
    expect(sharpenImage(input, 0).data).toEqual(input.data);
  });
  it("handles a fully transparent image without NaNs or opaque artifacts", () => {
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect([...sharpenImage(upscaleBicubic(image, 10, 10), 80).data].every(value => value === 0)).toBe(true);
  });
});
