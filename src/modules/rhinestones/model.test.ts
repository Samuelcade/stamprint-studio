import { describe, expect, it } from "vitest";
import { autoPositions, collisionIds, pathPositions, templateSvg } from "./model";
import type { Stone, StoneProject } from "./model";
import { readStoneProject } from "./storage";

describe("modelo de piedrería", () => {
  it("distribuye piedras a intervalos constantes sobre varios segmentos", () => {
    expect(pathPositions([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], .5)).toEqual([{ x: 0, y: 0 }, { x: .5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: .5 }, { x: 1, y: 1 }]);
  });
  it("detecta distancias insuficientes considerando el tamaño de ambas piedras", () => {
    const stones: Stone[] = [{ id: "a", x: 1, y: 1, size: "SS10", color: "#ffffff" }, { id: "b", x: 1.3, y: 1, size: "SS10", color: "#ffffff" }, { id: "c", x: 5, y: 5, size: "SS20", color: "#ffffff" }];
    expect([...collisionIds(stones, .1)].sort()).toEqual(["a", "b"]);
    expect(collisionIds(stones, 0).size).toBe(0);
  });
  it("distribuye solo sobre zonas oscuras y distingue relleno y contorno", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const p = (y * 10 + x) * 4; data[p] = data[p + 1] = data[p + 2] = x >= 2 && x < 8 && y >= 2 && y < 8 ? 0 : 255; data[p + 3] = 255; }
    const image = { width: 10, height: 10, data };
    const fill = autoPositions(image, 10, 10, 1, "grid", 200), contour = autoPositions(image, 10, 10, 1, "outline", 200), alternate = autoPositions(image, 10, 10, 1, "staggered", 200);
    expect(fill).toHaveLength(36); expect(contour.length).toBeLessThan(fill.length); expect(alternate.length).toBeGreaterThan(0);
    expect(fill.every(p => p.x >= 2 && p.x < 8 && p.y >= 2 && p.y < 8)).toBe(true);
  });
  it("genera círculos de plantilla en milímetros y a escala", () => {
    const project: StoneProject = { width: 25, height: 30, name: "test", source: "", stones: [{ id: "a", x: 2, y: 3, size: "SS10", color: "#ff0000" }] };
    const svg = templateSvg(project);
    expect(svg).toContain('width="250mm" height="300mm"'); expect(svg).toContain('cx="20.000" cy="30.000" r="1.400"'); expect(svg).not.toContain("#ff0000");
  });
  it("valida proyectos antes de recuperarlos", () => {
    const project: StoneProject = { width: 25, height: 30, name: "test", source: "", stones: [{ id: "a", x: 2, y: 3, size: "SS10", color: "#ff0000" }] };
    expect(readStoneProject(project)).toEqual(project);
    expect(() => readStoneProject({ ...project, stones: [{ ...project.stones[0], size: "SS999" }] })).toThrow(/dañado/);
  });
});
