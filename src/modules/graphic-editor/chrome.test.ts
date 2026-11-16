// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCanvas, loadImage as readImage } from "@napi-rs/canvas";
import { chromePixels } from "./chrome";
import { defaultEffects } from "./model";
import { measureTextLayer, ProjectRenderer } from "./render";
import { installTestCanvas } from "./testCanvas";
import type { Project, RasterLayer, TextLayer } from "../../core/types";

beforeEach(() => { installTestCanvas(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("crea reflejos plateados regulables sin cambiar el alfa ni modificar el original", () => {
  const width = 16, height = 40, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 3; y < 37; y++) for (let x = 3; x < 13; x++) data.set([210, 20, 40, 255], (y * width + x) * 4);
  data[(4 * width + 4) * 4 + 3] = 80;
  const before = new Uint8ClampedArray(data), image = { width, height, data }, silver = chromePixels(image, 100), blended = chromePixels(image, 50);
  const lights: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    expect(silver[i + 3]).toBe(data[i + 3]); expect(blended[i + 3]).toBe(data[i + 3]);
    if (!data[i + 3]) expect([...silver.slice(i, i + 4)]).toEqual([...data.slice(i, i + 4)]);
    else { lights.push(silver[i]); expect(Math.abs(silver[i] - silver[i + 2])).toBeLessThan(40); expect(Math.abs(blended[i] - (data[i] + silver[i]) / 2)).toBeLessThanOrEqual(1); }
  }
  expect(Math.max(...lights) - Math.min(...lights)).toBeGreaterThan(150);
  expect(chromePixels(image, 0)).toEqual(before); expect(data).toEqual(before);
});

it("ofrece reflejos cyber azules y holográficos rosa/cian con relieve regulable", () => {
  const width = 60, height = 100, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 5; y < 95; y++) for (let x = 5; x < 55; x++) data.set([180, 180, 180, 255], (y * width + x) * 4);
  const image = { width, height, data };
  const blue = chromePixels(image, 100, { chromeStyle: "blue" }), holographic = chromePixels(image, 100, { chromeStyle: "holographic" });
  let bluePixels = 0, pink = 0, cyan = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (blue[i + 2] - blue[i] > 80) bluePixels++;
    if (holographic[i] - holographic[i + 1] > 60 && holographic[i + 2] > holographic[i + 1]) pink++;
    if (holographic[i + 1] - holographic[i] > 60 && holographic[i + 2] > holographic[i]) cyan++;
    expect(blue[i + 3]).toBe(data[i + 3]); expect(holographic[i + 3]).toBe(data[i + 3]);
  }
  expect(bluePixels).toBeGreaterThan(100); expect(pink).toBeGreaterThan(100); expect(cyan).toBeGreaterThan(100);
  expect(chromePixels(image, 100, { chromeRelief: 0 })).not.toEqual(chromePixels(image, 100, { chromeRelief: 100 }));
});

it("curva los reflejos con el sombreado original y conserva los negros de una imagen opaca", () => {
  const width = 80, height = 80, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot((x - 40) / 30, (y - 40) / 30);
    const light = radius < 1 ? Math.round(30 + 220 * Math.sqrt(1 - radius * radius)) : 0;
    data.set([light, light, light, 255], (y * width + x) * 4);
  }
  const result = chromePixels({ width, height, data }, 100);
  expect([...result.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  expect(result[(40 * width + 30) * 4]).not.toBe(result[(40 * width + 50) * 4]);
  expect(result[(20 * width + 40) * 4]).not.toBe(result[(40 * width + 40) * 4]);
});

it("exporta el cromado de imagen conservando máscara, huecos y bordes semitransparentes", async () => {
  const source = document.createElement("canvas"); source.width = 40; source.height = 80; const ctx = source.getContext("2d")!;
  ctx.fillStyle = "red"; ctx.fillRect(5, 5, 30, 70); ctx.clearRect(15, 30, 10, 15);
  const pixels = ctx.getImageData(0, 0, 40, 80); pixels.data.set([255, 0, 0, 80], (10 * 40 + 5) * 4); ctx.putImageData(pixels, 0, 0);
  const mask = document.createElement("canvas"); mask.width = 40; mask.height = 80; mask.getContext("2d")!.fillRect(0, 0, 40, 65);
  const layer: RasterLayer = { id: "image", kind: "image", name: "Logo", source: source.toDataURL("image/png"), mask: mask.toDataURL("image/png"), pixelWidth: 40, pixelHeight: 80, width: 40, height: 80, x: 20, y: 40, rotation: 0, opacity: 1, visible: true, locked: false, effects: { ...defaultEffects, chrome: 100, chromeStyle: "holographic", chromeRelief: 80 } };
  const project: Project = { id: "chrome", name: "Cromado", width: 40, height: 80, dpi: 150, updatedAt: "", layers: [layer] };
  const renderer = new ProjectRenderer(), plain = await renderer.render({ ...project, layers: [{ ...layer, effects: { ...layer.effects, chrome: 0 } }] }, Infinity, true);
  const blob = await renderer.exportPng(project), exported = await readImage(new Uint8Array(await blob.arrayBuffer()));
  const result = createCanvas(40, 80), resultCtx = result.getContext("2d"); resultCtx.drawImage(exported, 0, 0);
  const originalAlpha = plain.getContext("2d")!.getImageData(0, 0, 40, 80).data, output = resultCtx.getImageData(0, 0, 40, 80).data;
  for (let i = 3; i < output.length; i += 4) expect(output[i]).toBe(originalAlpha[i]);
  expect([...output.slice((20 * 40 + 20) * 4, (20 * 40 + 20) * 4 + 3)]).not.toEqual([255, 0, 0]);
  expect(resultCtx.getImageData(20, 35, 1, 1).data[3]).toBe(0);
  expect(resultCtx.getImageData(20, 70, 1, 1).data[3]).toBe(0);
});

it("croma texto editable conservando su silueta al renderizar", async () => {
  const text = measureTextLayer({ kind: "text", id: "text", name: "Texto", text: "CHROME", fontFamily: "Arial", bold: true, italic: false, color: "#ff0000", align: "center", x: 200, y: 70, width: 300, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, effects: { ...defaultEffects } } satisfies TextLayer);
  const project: Project = { id: "text-project", name: "Texto", width: 400, height: 140, dpi: 150, updatedAt: "", layers: [text] };
  const renderer = new ProjectRenderer(), plain = await renderer.render(project, Infinity, true), chrome = await renderer.render({ ...project, layers: [{ ...text, effects: { ...text.effects, chrome: 100 } }] }, Infinity, true);
  const before = plain.getContext("2d")!.getImageData(0, 0, 400, 140).data, after = chrome.getContext("2d")!.getImageData(0, 0, 400, 140).data;
  const silver: number[] = [];
  for (let i = 0; i < after.length; i += 4) if (after[i + 3] > 250) { silver.push(after[i]); expect(before[i + 3]).toBeGreaterThan(200); expect(Math.abs(after[i] - after[i + 2])).toBeLessThan(40); }
  expect(silver.length).toBeGreaterThan(100); expect(Math.max(...silver) - Math.min(...silver)).toBeGreaterThan(150);
  expect(text.text).toBe("CHROME"); expect(text.effects.chrome).toBeUndefined();
});
