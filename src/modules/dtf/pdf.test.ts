import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { sheetPdf } from "./pdf";

function stream(bytes: Buffer, id: number) {
  const text = bytes.toString("latin1"), start = text.indexOf(`${id} 0 obj\n`), marker = text.indexOf("\nstream\n", start), header = text.slice(start, marker);
  const length = Number(header.match(/\/Length (\d+)/)?.[1]);
  return inflateSync(bytes.subarray(marker + 8, marker + 8 + length));
}

it("crea un PDF a escala con colores sin pérdida y máscara de transparencia", async () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 64]);
  const blob = await sheetPdf({ width: 2, height: 1, data }, 25.4, 12.7);
  expect(blob.type).toBe("application/pdf");
  const bytes = Buffer.from(await blob.arrayBuffer()), text = bytes.toString("latin1");
  expect(text).toContain("/MediaBox [0 0 720 360]"); expect(text).toContain("/SMask 6 0 R");
  expect([...stream(bytes, 5)]).toEqual([255, 0, 0, 0, 0, 255]); expect([...stream(bytes, 6)]).toEqual([255, 64]);
  const xref = Number(text.match(/startxref\n(\d+)/)?.[1]); expect(text.slice(xref, xref + 4)).toBe("xref");
});

it("omite la máscara de transparencia si el fondo es completamente opaco", async () => {
  const blob = await sheetPdf({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }, 2.54, 2.54);
  const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  expect(text).toContain("/MediaBox [0 0 72 72]"); expect(text).not.toContain("/SMask");
});
