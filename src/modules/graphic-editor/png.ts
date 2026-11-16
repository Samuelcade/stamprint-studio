/** Canvas PNG defaults to 96 DPI. Write pHYs so print software reads the document DPI. */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const payload = new Uint8Array(9), view = new DataView(payload.buffer);
  const pixelsPerMeter = Math.round(dpi / .0254);
  view.setUint32(0, pixelsPerMeter); view.setUint32(4, pixelsPerMeter); payload[8] = 1;
  const chunk = new Uint8Array(21), chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); chunk.set(payload, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunkView.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  const sourceView = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let offset = 8; offset < png.length;) {
    const length = sourceView.getUint32(offset), end = offset + length + 12;
    if (end > png.length) throw new Error("PNG incompleto");
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(png.subarray(offset, end));
    if (type === "IHDR") parts.push(chunk);
    offset = end;
  }
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
