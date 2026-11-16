import { describe, expect, it } from "vitest";
import { enhance } from "./enhance";

describe("enhance", () => {
  it("brightens a non-destructive working image", () => {
    const image = { data: new Uint8ClampedArray([100, 100, 100, 255]), width: 1, height: 1 } as ImageData;
    expect(enhance(image, { brightness: 20, contrast: 0, saturation: 0 }).data[0]).toBeGreaterThan(100);
    expect(image.data[0]).toBe(100);
  });
});
