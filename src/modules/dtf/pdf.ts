/** One-page PDF embedding the full-resolution canvas as lossless RGB + optional alpha. */
export async function sheetPdf(image: { width: number; height: number; data: Uint8ClampedArray }, widthCm: number, heightCm: number): Promise<Blob> {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4 || !Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) throw new Error("Las medidas de la hoja no son válidas.");
  if (typeof CompressionStream === "undefined") throw new Error("Este navegador no admite la compresión necesaria para PDF. Actualiza el navegador.");
  const rgb = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height);
  let transparent = false;
  for (let p = 0; p < alpha.length; p++) { const i = p * 4, j = p * 3; rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2]; alpha[p] = data[i + 3]; if (alpha[p] !== 255) transparent = true; }
  const compress = async (bytes: Uint8Array) => new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const rgbData = await compress(rgb), alphaData = transparent ? await compress(alpha) : undefined;
  const encoder = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [0]; let length = 0;
  const add = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  const object = (id: number, content: string) => { offsets[id] = length; add(`${id} 0 obj\n${content}\nendobj\n`); };
  const stream = (id: number, dict: string, bytes: Uint8Array) => { offsets[id] = length; add(`${id} 0 obj\n<< ${dict} /Length ${bytes.length} >>\nstream\n`); add(bytes); add("\nendstream\nendobj\n"); };
  const pageWidth = +(widthCm / 2.54 * 72).toFixed(5), pageHeight = +(heightCm / 2.54 * 72).toFixed(5);
  add("%PDF-1.4\n%STAMPRINT\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  const content = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  stream(4, "", content);
  stream(5, `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${alphaData ? " /SMask 6 0 R" : ""}`, rgbData);
  if (alphaData) stream(6, `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, alphaData);
  const xref = length, count = alphaData ? 7 : 6;
  add(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) add(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
