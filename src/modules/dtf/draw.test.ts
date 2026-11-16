import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { drawBackground, drawDesign } from "./draw";
import type { Design } from "./layout";

it("rasteriza el diseño girado en la posición y orientación de la hoja", () => {
  const source = createCanvas(20, 10), sourceCtx = source.getContext("2d");
  sourceCtx.fillStyle = "#ff0000"; sourceCtx.fillRect(0, 0, 10, 10);
  sourceCtx.fillStyle = "#0000ff"; sourceCtx.fillRect(10, 0, 10, 10);
  const canvas = createCanvas(100, 100), ctx = canvas.getContext("2d");
  const item: Design = { id: "1", name: "test", source: "", width: 20, height: 10, x: 30, y: 20, rotated: false, rotation: 90 };
  drawDesign(ctx as unknown as CanvasRenderingContext2D, source as unknown as CanvasImageSource, item, 1);
  expect([...ctx.getImageData(35, 25, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...ctx.getImageData(35, 35, 1, 1).data]).toEqual([0, 0, 255, 255]);
  expect(ctx.getImageData(25, 25, 1, 1).data[3]).toBe(0);
});

it("conserva transparencia o rellena de blanco según el fondo elegido", () => {
  const canvas = createCanvas(2, 2), ctx = canvas.getContext("2d");
  drawBackground(ctx as unknown as CanvasRenderingContext2D, 2, 2, "transparent");
  expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  drawBackground(ctx as unknown as CanvasRenderingContext2D, 2, 2, "white");
  expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([255, 255, 255, 255]);
});
