import { describe, expect, it } from "vitest";
import { alphaBounds, croppedDesign } from "./crop";
import type { Design } from "./layout";

describe("recorte DTF", () => {
  it("detecta todos los píxeles visibles, incluso bordes semitransparentes", () => {
    const pixels = new Uint8ClampedArray(5 * 4 * 4);
    pixels[(1 * 5 + 2) * 4 + 3] = 1; pixels[(2 * 5 + 3) * 4 + 3] = 255;
    expect(alphaBounds(pixels, 5, 4)).toEqual({ x: 2, y: 1, width: 2, height: 2 });
    expect(alphaBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
  it("mantiene el tamaño físico de cada píxel y la posición del contenido", () => {
    const item: Design = { id: "1", name: "arte", source: "original", width: 20, height: 10, x: 2, y: 3, rotated: false };
    const rect = { x: 20, y: 10, width: 60, height: 30 };
    expect(croppedDesign(item, rect, 100, 50, "recorte")).toMatchObject({ width: 12, height: 6, x: 6, y: 5, source: "recorte" });
    expect(croppedDesign({ ...item, rotated: true }, rect, 100, 50, "recorte")).toMatchObject({ width: 12, height: 6, x: 4, y: 7 });
  });
  it("mantiene el centro del contenido al recortar simétricamente una imagen girada", () => {
    const item: Design = { id: "1", name: "arte", source: "x", width: 20, height: 10, x: 4, y: 7, rotated: false, rotation: 45 };
    const result = croppedDesign(item, { x: 25, y: 10, width: 50, height: 30 }, 100, 50, "recorte");
    const diagonal = Math.SQRT1_2;
    expect(result.x + (result.width + result.height) * diagonal / 2).toBeCloseTo(item.x + (item.width + item.height) * diagonal / 2);
    expect(result.y + (result.width + result.height) * diagonal / 2).toBeCloseTo(item.y + (item.width + item.height) * diagonal / 2);
  });
});
