import { describe, expect, it } from "vitest";
import { recolorLabels, renderSeparation, separatePixels } from "./separate";
import { readScreenProject } from "./storage";

describe("separación de tintas", () => {
  it("separa colores, conserva el alfa y permite ver cada tinta", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 128, 0, 0, 255, 255, 0, 0, 0, 0]);
    const result = separatePixels(4, 1, pixels, 2, false);
    expect(result.inks).toHaveLength(2);
    expect(result.labels[0]).toBe(result.labels[1]); expect(result.labels[2]).not.toBe(result.labels[0]); expect(result.labels[3]).toBe(255);
    const single = renderSeparation(result, result.labels[0]);
    expect(single[3]).toBe(255); expect(single[7]).toBe(128); expect(single[11]).toBe(0);
    const merged = { ...result, labels: recolorLabels(result.labels, result.labels[2], result.labels[0]), inks: result.inks.slice(0, 1) };
    expect(renderSeparation(merged, null)[11]).toBe(255);
  });
  it("quita blanco solo si se solicita y rechaza un diseño completamente vacío", () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const result = separatePixels(2, 1, pixels, 2, true);
    expect(result.labels[0]).toBe(255); expect(result.labels[1]).not.toBe(255);
    expect(() => separatePixels(1, 1, new Uint8ClampedArray(4), 2, false)).toThrow(/visibles/);
  });
  it("oculta y elimina tintas sin modificar las otras", () => {
    const result = separatePixels(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, false);
    const hidden = { ...result, inks: result.inks.map(ink => ({ ...ink, visible: ink.id !== result.labels[0] })) };
    expect(renderSeparation(hidden, null)[3]).toBe(0); expect(renderSeparation(hidden, null)[7]).toBe(255);
    expect([...recolorLabels(result.labels, result.labels[0], 255)]).toEqual([255, result.labels[1]]);
  });
  it("rechaza proyectos guardados con áreas o tintas corruptas", () => {
    const result = separatePixels(1, 1, new Uint8ClampedArray([255, 0, 0, 255]), 2, false);
    const project = { input: { name: "arte", source: "data:image/png;base64,AA==" }, result, colors: 2, removeWhite: false, selected: 0 };
    expect(readScreenProject(project)).toEqual(project);
    expect(() => readScreenProject({ ...project, result: { ...result, labels: new Uint8Array([42]) } })).toThrow(/inválidas/);
  });
});
