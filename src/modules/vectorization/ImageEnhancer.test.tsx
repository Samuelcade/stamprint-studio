// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageEnhancer } from "./ImageEnhancer";
import { downloadFile } from "./io";

vi.mock("./io", () => ({ downloadFile: vi.fn() }));
class FakeWorker {
  static instance: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { preventDefault: () => void }) => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { FakeWorker.instance = this; }
}
beforeEach(() => { vi.stubGlobal("Worker", FakeWorker); const NativeURL = URL; vi.stubGlobal("URL", class extends NativeURL { static createObjectURL = vi.fn(() => "blob:result"); static revokeObjectURL = vi.fn(); }); vi.mocked(downloadFile).mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("mejora y descarga en 8K sin vectorizar, y permite elegir 4K", async () => {
  const user = userEvent.setup(), back = vi.fn();
  render(<ImageEnhancer initialSource="data:image/png;base64,AA==" initialName="arte" onBack={back} />);
  const image = screen.getByAltText("Imagen original");
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } }); fireEvent.load(image);
  expect(screen.getByText(/7680 × 3840 px/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "✦ Mejorar y descargar" }));
  expect(FakeWorker.instance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ size: "8k", strength: 35, mask: "" }));
  const blob = new Blob(["png"], { type: "image/png" });
  act(() => FakeWorker.instance.onmessage!({ data: { type: "done", blob, width: 7680, height: 3840 } }));
  expect(downloadFile).toHaveBeenCalledWith(blob, "arte-mejorada-7680x3840.png");
  await screen.findByAltText("Imagen mejorada");
  await user.click(screen.getByRole("button", { name: "Descargar otra vez" })); expect(downloadFile).toHaveBeenCalledTimes(2);
  await user.selectOptions(screen.getByLabelText("Calidad de salida"), "4k");
  expect(screen.getByText(/4096 × 2048 px/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "← Volver a vectorización" })); expect(back).toHaveBeenCalledOnce();
});
