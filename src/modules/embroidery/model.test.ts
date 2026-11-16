import { describe, expect, it } from "vitest";
import { blankEmbroidery, embroiderySvg, fillDarkAreas, sampleStitches, visibleStitches } from "./model";

describe("trazos de bordado", () => {
  it("limita la longitud de cada puntada y conserva las esquinas", () => {
    const result = sampleStitches([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: .5 }], .25);
    expect(result[0]).toEqual({ x: 0, y: 0 }); expect(result.at(-1)).toEqual({ x: 1, y: .5 });
    expect(result).toContainEqual({ x: 1, y: 0 });
    for (let i = 1; i < result.length; i++) expect(Math.hypot(result[i].x - result[i - 1].x, result[i].y - result[i - 1].y)).toBeLessThanOrEqual(.2500001);
  });
  it("genera un SVG de referencia con medidas físicas y colores de hilo", () => {
    const project = { ...blankEmbroidery(), width: 15, height: 20, paths: [{ id: "a", color: "#ef476f", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] };
    const svg = embroiderySvg(project); expect(svg).toContain('width="150mm" height="200mm"'); expect(svg).toContain('points="10,20 30,40"'); expect(svg).toContain('stroke="#ef476f"');
  });
  it("rellena solo las zonas oscuras con trazos separados y filas alternas", () => {
    const data = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const i = (y * 8 + x) * 4, c = x === 2 || x === 5 ? 255 : 0; data[i] = data[i + 1] = data[i + 2] = c; data[i + 3] = 255; }
    const paths = fillDarkAreas({ width: 8, height: 4, data }, 8, 4, 1, 1, 180);
    expect(paths.length).toBe(12);
    expect(paths[0][0].x).toBeLessThan(paths[0].at(-1)!.x);
    expect(paths[3][0].x).toBeGreaterThan(paths[3].at(-1)!.x);
    expect(paths[0].at(-1)!.x).toBeLessThanOrEqual(2);
  });
  it("recorta la simulación sin modificar los trazos originales", () => {
    const paths = [{ id: "a", color: "#000000", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }, { id: "b", color: "#ffffff", points: [{ x: 0, y: 1 }, { x: 1, y: 1 }] }];
    expect(visibleStitches(paths, 2)[0].points).toHaveLength(2);
    expect(visibleStitches(paths, 4)).toHaveLength(1);
    expect(visibleStitches(paths, 5)).toHaveLength(2); expect(paths[0].points).toHaveLength(3);
  });
});
