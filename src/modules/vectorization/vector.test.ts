import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { defaultTraceOptions, pathData, signedArea, tracePixels, vectorSvg } from "./vector";

const exact = { ...defaultTraceOptions, colors: 2, simplification: 0, minArea: 0 };
function image(width = 20, height = 20) { const canvas = createCanvas(width, height); return { canvas, ctx: canvas.getContext("2d") }; }
describe("local vector tracing", () => {
  it("creates true closed paths, physical cm and no embedded image", () => {
    const { ctx } = image(); ctx.fillStyle = "#ff0000"; ctx.fillRect(3, 4, 10, 8);
    const result = tracePixels(ctx.getImageData(0, 0, 20, 20), exact);
    expect(result.paths).toHaveLength(1); expect(result.paths[0].contours[0]).toHaveLength(4);
    expect(signedArea(result.paths[0].contours[0])).toBe(80);
    const svg = vectorSvg(result, 25, false); expect(svg).toContain('width="25cm"'); expect(svg).toContain('height="25cm"'); expect(svg).toContain("<path"); expect(svg).not.toMatch(/<image|base64/);
  });
  it("retains holes and transparency when rasterizing the exported SVG", async () => {
    const { ctx } = image(); ctx.fillStyle = "red"; ctx.fillRect(2, 2, 16, 16); ctx.clearRect(6, 6, 8, 8);
    const result = tracePixels(ctx.getImageData(0, 0, 20, 20), exact);
    expect(result.paths[0].contours).toHaveLength(2);
    expect(result.paths[0].contours.map(signedArea).sort((a, b) => a - b)).toEqual([-64, 256]);
    const output = await loadImage(new TextEncoder().encode(vectorSvg(result, 20, false))), target = image(); target.ctx.drawImage(output, 0, 0, 20, 20);
    expect(target.ctx.getImageData(10, 10, 1, 1).data[3]).toBe(0); expect(target.ctx.getImageData(3, 3, 1, 1).data[3]).toBe(255); expect(target.ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  });
  it("keeps diagonal pixels as separate contours and reproduces random pixel masks", async () => {
    const { ctx } = image(8, 8); let seed = 42;
    const pixels = ctx.createImageData(8, 8);
    for (let i = 0; i < 64; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; pixels.data[i * 4] = 255; pixels.data[i * 4 + 3] = seed % 3 ? 255 : 0; }
    const result = tracePixels(pixels, exact);
    const rendered = await loadImage(new TextEncoder().encode(vectorSvg(result, 8, false).replace(/width="[^"]+cm"/, 'width="8"').replace(/height="[^"]+cm"/, 'height="8"'))); ctx.drawImage(rendered, 0, 0, 8, 8);
    const actual = ctx.getImageData(0, 0, 8, 8).data;
    for (let i = 0; i < 64; i++) expect(actual[i * 4 + 3], `pixel ${i}`).toBe(pixels.data[i * 4 + 3]);
    ctx.clearRect(0, 0, 8, 8); ctx.fillStyle = "red"; ctx.fillRect(1, 1, 1, 1); ctx.fillRect(2, 2, 1, 1);
    expect(tracePixels(ctx.getImageData(0, 0, 8, 8), exact).paths[0].contours).toHaveLength(2);
  });
  it("quantizes colors deterministically and removes white when requested", () => {
    const { ctx } = image(); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 20, 20); ctx.fillStyle = "red"; ctx.fillRect(2, 2, 5, 5); ctx.fillStyle = "blue"; ctx.fillRect(10, 10, 5, 5);
    const input = ctx.getImageData(0, 0, 20, 20), options = { ...exact, colors: 3 };
    const first = tracePixels(input, options); expect(tracePixels(input, options)).toEqual(first); expect(first.paths.map(path => path.color).sort()).toEqual(["#0000ff", "#ff0000", "#ffffff"]);
    expect(tracePixels(input, { ...options, removeWhite: true }).paths.map(path => path.color).sort()).toEqual(["#0000ff", "#ff0000"]);
  });
  it("supports monochrome inversion, alpha cutoff and speck removal", () => {
    const { ctx } = image(); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 20, 20); ctx.fillStyle = "black"; ctx.fillRect(5, 5, 10, 10); ctx.fillRect(1, 1, 1, 1);
    const input = ctx.getImageData(0, 0, 20, 20);
    const normal = tracePixels(input, { ...exact, mode: "mono", minArea: 4 }); expect(normal.paths[0].contours).toHaveLength(1); expect(signedArea(normal.paths[0].contours[0])).toBe(100);
    const inverted = tracePixels(input, { ...exact, mode: "mono", invert: true }); expect(inverted.paths[0].contours).toHaveLength(3);
    ctx.clearRect(0, 0, 20, 20); ctx.fillStyle = "rgba(255,0,0,.2)"; ctx.fillRect(1, 1, 18, 18);
    expect(() => tracePixels(ctx.getImageData(0, 0, 20, 20), { ...exact, alphaThreshold: 128 })).toThrow(/No quedan/);
  });
  it("simplifies complex outlines, supports rounded curves, and omits hidden colors", () => {
    const { ctx } = image(100, 100); ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(50, 50, 35, 0, Math.PI * 2); ctx.fill();
    const pixels = ctx.getImageData(0, 0, 100, 100), raw = tracePixels(pixels, exact), simplified = tracePixels(pixels, { ...exact, simplification: 2 });
    expect(simplified.paths[0].contours[0].length).toBeLessThan(raw.paths[0].contours[0].length);
    expect(pathData(simplified.paths[0].contours, true)).toContain("Q");
    expect(vectorSvg({ ...simplified, paths: simplified.paths.map(path => ({ ...path, visible: false })) }, 25, true)).not.toContain("<path");
  });
  it("rejects malformed dimensions and unsafe output colors", () => {
    expect(() => tracePixels({ width: 1, height: 1, data: new Uint8ClampedArray() }, exact)).toThrow(/inválida/);
    expect(() => vectorSvg({ width: 1, height: 1, paths: [] }, NaN, false)).toThrow(/ancho/);
    expect(() => vectorSvg({ width: 1, height: 1, paths: [{ id: "x", color: '" onload="alert(1)', visible: true, contours: [] }] }, 25, false)).toThrow(/inválidos/);
  });
});
