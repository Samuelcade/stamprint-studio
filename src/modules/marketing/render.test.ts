import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { blankPoster } from "./model";
import { drawPosterBackground, drawPosterLayer, tintPixels } from "./render";

it("aplica el color solo dentro de la máscara conservando la luz", () => {
  const original = new Uint8ClampedArray([240, 240, 240, 255, 120, 120, 120, 255]);
  const mask = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
  tintPixels(original, mask, "#ff0000");
  expect(original[0]).toBeGreaterThan(original[1]); expect([...original.slice(4)]).toEqual([120, 120, 120, 255]);
  const colored = new Uint8ClampedArray([200, 80, 20, 255]);
  tintPixels(colored, new Uint8ClampedArray([255, 255, 255, 255]), "#ffffff");
  expect(colored[0]).toBe(colored[1]); expect(colored[1]).toBe(colored[2]);
});

it("dibuja la plantilla y el estampado en la posición de salida", () => {
  const canvas = createCanvas(600, 700), ctx = canvas.getContext("2d"), project = { ...blankPoster(), template: "shirt-front" as const, background: "#111111", garmentColor: "#ffffff" };
  drawPosterBackground(ctx as unknown as CanvasRenderingContext2D, 600, 700, project);
  expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([17, 17, 17, 255]);
  expect(ctx.getImageData(300, 350, 1, 1).data[0]).toBeGreaterThan(240);
  const image = createCanvas(10, 10), imageCtx = image.getContext("2d"); imageCtx.fillStyle = "#ff0000"; imageCtx.fillRect(0, 0, 10, 10);
  drawPosterLayer(ctx as unknown as CanvasRenderingContext2D, 600, 700, { id: "x", kind: "image", name: "arte", source: "", x: .5, y: .5, width: .2, aspect: 1, rotation: 0 }, image as unknown as HTMLImageElement);
  expect([...ctx.getImageData(300, 350, 1, 1).data]).toEqual([255, 0, 0, 255]);
});
