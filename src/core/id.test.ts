import { afterEach, expect, it, vi } from "vitest";
import { createId } from "./id";
afterEach(() => vi.unstubAllGlobals());
it("genera identificadores con getRandomValues cuando randomUUID no está disponible", () => {
  vi.stubGlobal("crypto", { getRandomValues: (data: Uint8Array) => { data.fill(171); return data; } });
  expect(createId()).toBe("abababab-abab-4bab-abab-abababababab");
});
