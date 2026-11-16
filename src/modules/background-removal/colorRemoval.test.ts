import { describe, expect, it } from "vitest";
import { removeColor } from "./colorRemoval";

describe("removeColor", () => {
  it("only removes the connected matching background", () => {
    const image = { data: new Uint8ClampedArray([
      255, 255, 255, 255, 20, 20, 20, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 20, 20, 20, 255, 255, 255, 255, 255,
    ]), width: 3, height: 2 } as ImageData;
    const mask = removeColor(image, { x: 0, y: 0 }, 0, "connected");
    expect([...mask]).toEqual([0, 255, 255, 0, 255, 255]);
  });
});
