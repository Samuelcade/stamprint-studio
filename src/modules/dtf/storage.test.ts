// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { loadSheet, readSheet, saveSheet } from "./storage";
import type { Sheet } from "./layout";

afterEach(() => vi.unstubAllGlobals());
it("guarda la hoja editable y rechaza datos guardados inválidos", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const sheet: Sheet = { width: 58, height: 100, gap: 1, dpi: 150, background: "white", items: [{ id: "1", name: "arte", source: "data:image/png;base64,AA==", width: 10, height: 5, x: 3, y: 4, rotated: false, rotation: 45 }] };
  await saveSheet(sheet); expect(await loadSheet()).toEqual(sheet);
  expect(() => readSheet({ ...sheet, items: [{ ...sheet.items[0], width: NaN }] })).toThrow(/inválido/);
  expect(() => readSheet({ ...sheet, items: [sheet.items[0], sheet.items[0]] })).toThrow(/inválido/);
});
