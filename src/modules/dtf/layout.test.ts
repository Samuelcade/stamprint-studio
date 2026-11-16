import { describe, expect, it } from "vitest";
import { arrange, dimensions, layoutIssues, place, rotateDesign } from "./layout";
import type { Design } from "./layout";

const design = (id: string, width: number, height: number): Design => ({ id, name: id, source: "", width, height, x: 0, y: 0, rotated: false });
describe("mesa DTF", () => {
  it("distribuye por filas respetando separación y límites", () => {
    const packed = arrange([design("a", 4, 3), design("b", 4, 3), design("c", 4, 3)], 10, 7, 1);
    expect(packed).not.toBeNull();
    expect(layoutIssues(packed!, 10, 7, 1)).toEqual({ outside: 0, overlaps: 0 });
    expect(packed![2].y).toBe(4);
  });
  it("rechaza una distribución que no cabe sin cambiar los originales", () => {
    const items = [design("a", 6, 4), design("b", 6, 4)];
    expect(arrange(items, 10, 8, 1)).toBeNull();
    expect(items[1].y).toBe(0);
  });
  it("detecta separación insuficiente y elementos fuera, considerando el giro", () => {
    const a = { ...design("a", 5, 2), rotated: true };
    const b = { ...design("b", 2, 2), x: 2.5, y: 4 };
    expect(dimensions(a)).toEqual({ width: 2, height: 5 });
    expect(layoutIssues([a, b], 4, 5, 1)).toEqual({ outside: 1, overlaps: 1 });
  });
  it("encuentra espacio para una copia sin mover los diseños existentes", () => {
    const original = design("a", 4, 3);
    const copy = place(design("b", 4, 3), [original], 10, 7, 1);
    expect(copy).toMatchObject({ x: 5, y: 0 });
    expect(layoutIssues([original, copy!], 10, 7, 1)).toEqual({ outside: 0, overlaps: 0 });
    expect(place(design("c", 10, 7), [original], 10, 7, 1)).toBeNull();
  });
  it("calcula el espacio a 45 grados y gira alrededor del centro", () => {
    const original = { ...design("a", 10, 4), x: 10, y: 10 };
    const rotated = rotateDesign(original, 45), size = dimensions(rotated);
    expect(size.width).toBeCloseTo(14 / Math.sqrt(2)); expect(size.height).toBeCloseTo(14 / Math.sqrt(2));
    expect(rotated.x + size.width / 2).toBeCloseTo(15); expect(rotated.y + size.height / 2).toBeCloseTo(12);
    expect(rotateDesign(rotated, 360).rotation).toBe(0);
  });
});
