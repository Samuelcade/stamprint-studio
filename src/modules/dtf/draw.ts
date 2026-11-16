import { angle, dimensions } from "./layout";
import type { Design } from "./layout";

export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, background: "transparent" | "white") {
  if (background === "white") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height); }
}

/** Render the same centered transform used by the sheet preview. */
export function drawDesign(ctx: CanvasRenderingContext2D, image: CanvasImageSource, item: Design, scale: number) {
  const size = dimensions(item);
  ctx.save();
  try {
    ctx.translate((item.x + size.width / 2) * scale, (item.y + size.height / 2) * scale);
    ctx.rotate(angle(item) * Math.PI / 180);
    ctx.drawImage(image, -item.width * scale / 2, -item.height * scale / 2, item.width * scale, item.height * scale);
  } finally { ctx.restore(); }
}
