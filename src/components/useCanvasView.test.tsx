// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useCanvasView, viewGeometry } from "./useCanvasView";
import { ViewControls } from "./ViewControls";

const cancelEdit = vi.fn(), finishEdit = vi.fn();
function Harness() {
  const view = useCanvasView(1000, 1000, cancelEdit);
  return <><ViewControls {...view} /><div data-testid="view" ref={view.viewportRef} {...view.events}><div style={view.space}><div data-testid="art" style={{ width: 1000 * view.scale, height: 1000 * view.scale }} onPointerUp={finishEdit} /></div></div></>;
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; pointerType: string; constructor(type: string, options: PointerEventInit) { super(type, options); this.pointerId = options.pointerId ?? 1; this.pointerType = options.pointerType ?? "touch"; } });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  cancelEdit.mockClear(); finishEdit.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("fits narrow screens while preserving document proportions", () => {
  const small = viewGeometry(1080, 1920, { x: 320, y: 400 }, 1);
  expect(1080 * small.scale).toBeLessThanOrEqual(272);
  expect(1920 * small.scale).toBeLessThanOrEqual(352);
  expect(viewGeometry(1080, 1920, { x: 320, y: 400 }, 2).scale).toBeCloseTo(small.scale * 2);
});
it("pinches around the fingers and consumes the remaining finger so no layer drag is committed", () => {
  render(<Harness />); const art = screen.getByTestId("art");
  fireEvent.pointerDown(art, { pointerId: 1, clientX: 200, clientY: 200 });
  fireEvent.pointerDown(art, { pointerId: 2, clientX: 300, clientY: 200 });
  expect(cancelEdit).toHaveBeenCalledOnce();
  fireEvent.pointerMove(art, { pointerId: 2, clientX: 400, clientY: 200 });
  expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("200%");
  fireEvent.pointerUp(art, { pointerId: 2 }); fireEvent.pointerUp(art, { pointerId: 1 });
  expect(finishEdit).not.toHaveBeenCalled();
  fireEvent.pointerDown(art, { pointerId: 3 }); fireEvent.pointerUp(art, { pointerId: 3 });
  expect(finishEdit).toHaveBeenCalledOnce();
});
it("pans independently and resets zoom, with wheel zoom only when Ctrl is pressed", () => {
  render(<Harness />); const art = screen.getByTestId("art"), view = screen.getByTestId("view");
  fireEvent.click(screen.getByRole("button", { name: "Acercar lienzo" }));
  expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("120%");
  fireEvent.click(screen.getByRole("button", { name: "Mover vista" }));
  const before = view.scrollLeft;
  fireEvent.pointerDown(art, { pointerId: 1, clientX: 250, clientY: 250 });
  fireEvent.pointerMove(art, { pointerId: 1, clientX: 180, clientY: 220 });
  expect(view.scrollLeft).toBe(before + 70);
  fireEvent.pointerCancel(art, { pointerId: 1 }); expect(finishEdit).not.toHaveBeenCalled();
  fireEvent.wheel(view, { deltaY: -50 }); expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("120%");
  fireEvent.wheel(view, { deltaY: -50, ctrlKey: true }); expect(Number(screen.getByLabelText("Zoom del lienzo").getAttribute("aria-valuenow"))).toBeGreaterThan(120);
  fireEvent.click(screen.getByRole("button", { name: "Ajustar" })); expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("100%");
});
