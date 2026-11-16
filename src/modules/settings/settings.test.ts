// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, validateSettings } from "./settings";

beforeEach(() => localStorage.clear());
describe("preferencias locales", () => {
  it("guarda, recupera y valida las preferencias", () => {
    const value = { ...DEFAULT_SETTINGS, autoSave: false, editor: { ...DEFAULT_SETTINGS.editor, dpi: 150 }, dtf: { ...DEFAULT_SETTINGS.dtf, width: 42 } };
    saveSettings(value); expect(loadSettings()).toEqual(value);
    expect(() => validateSettings({ ...value, editor: { ...value.editor, widthCm: 100, heightCm: 100, dpi: 600 } })).toThrow(/supera/);
    expect(() => validateSettings({ ...value, dtf: { ...value.dtf, width: 0 } })).toThrow(/DTF/);
  });
  it("usa valores seguros cuando la configuración almacenada está dañada", () => {
    localStorage.setItem("stamprint-settings-v1", "{inválido"); expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
