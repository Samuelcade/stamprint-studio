import { describe, expect, it } from "vitest";
import type { Project, RasterLayer } from "../../core/types";
import { defaultEffects, historyReducer, hitLayer, normalizeProject, resizeDocument, toLocalPoint } from "./model";
import { pngWithDpi } from "./png";

const image = (id = "image"): RasterLayer => ({ kind: "image", id, name: id, x: 100, y: 100, width: 80, height: 40, rotation: 90, visible: true, locked: false, opacity: 1, source: "original", mask: "mask", pixelWidth: 800, pixelHeight: 400, effects: { ...defaultEffects } });
const project = (): Project => ({ id: "project", name: "Test", width: 1200, height: 1200, dpi: 300, updatedAt: "", layers: [image()] });

describe("editor documents", () => {
  it("migrates an existing image and retains source, mask and effects", () => {
    const old = { ...project(), layers: [{ id: "old", name: "Old", visible: true, locked: false, opacity: .7, source: "original", mask: "mask", effects: { brightness: 20 } }] } as unknown as Project;
    const migrated = normalizeProject(old).layers[0];
    expect(migrated).toMatchObject({ kind: "image", x: 600, y: 600, width: 1200, height: 1200, pixelWidth: 1200, pixelHeight: 1200, rotation: 0, source: "original", mask: "mask", opacity: .7 });
    expect(migrated.effects).toMatchObject({ brightness: 20, contrast: 0, mirror: false });
  });
  it("preserves physical object measurements when DPI changes", () => {
    const before = project(), after = resizeDocument(before, 25, 30, 150);
    expect(after.width).toBe(1476); expect(after.height).toBe(1772);
    for (const key of ["x", "y", "width", "height"] as const) expect(after.layers[0][key] / after.dpi).toBe(before.layers[0][key] / before.dpi);
    expect(after.layers[0]).toMatchObject({ source: "original", mask: "mask", pixelWidth: 800 });
  });
  it("resizes the canvas without stretching artwork at the same DPI", () => {
    const before = project(), after = resizeDocument(before, 25, 30, 300);
    expect(after.layers).toEqual(before.layers);
    expect(() => resizeDocument(before, 100, 100, 600)).toThrow();
    expect(() => resizeDocument(before, NaN, 30, 300)).toThrow();
  });
  it("hit-tests rotated layers in reverse stacking order, ignoring hidden objects", () => {
    const back = image("back"), top = image("top");
    expect(toLocalPoint(back, { x: 100, y: 130 }).x).toBeCloseTo(30);
    expect(hitLayer([back, top], { x: 100, y: 130 })?.id).toBe("top");
    expect(hitLayer([back, { ...top, visible: false }], { x: 100, y: 130 })?.id).toBe("back");
    expect(hitLayer([back], { x: 130, y: 100 })).toBeUndefined();
  });
  it("undoes grouped input changes once and clears redo on a new change", () => {
    const original = project();
    let state = historyReducer({ present: original, past: [], future: [] }, { type: "commit", project: { ...original, name: "A" }, group: "name" });
    state = historyReducer(state, { type: "commit", project: { ...original, name: "AB" }, group: "name" });
    expect(state.past).toHaveLength(1);
    state = historyReducer(state, { type: "undo" }); expect(state.present.name).toBe("Test");
    state = historyReducer(state, { type: "redo" }); expect(state.present.name).toBe("AB");
    state = historyReducer(state, { type: "undo" });
    state = historyReducer(state, { type: "commit", project: { ...original, name: "New" } }); expect(state.future).toHaveLength(0);
  });
});

describe("print PNG metadata", () => {
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
  it("writes 300 DPI with the correct pHYs CRC and no duplicate density chunks", () => {
    const output = pngWithDpi(pngWithDpi(png, 150), 300), view = new DataView(output.buffer);
    let count = 0;
    for (let offset = 8; offset < output.length;) {
      const length = view.getUint32(offset), type = String.fromCharCode(...output.subarray(offset + 4, offset + 8));
      if (type === "pHYs") {
        count++; expect(view.getUint32(offset + 8)).toBe(11811); expect(view.getUint32(offset + 12)).toBe(11811);
        expect(output[offset + 16]).toBe(1); expect(view.getUint32(offset + 17)).toBe(0x78a53f76);
      }
      offset += length + 12;
    }
    expect(count).toBe(1); expect(output.length).toBe(png.length + 21);
  });
});
