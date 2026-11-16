import { renderHalftone, ScreenSettings } from "./halftone";
self.onmessage = (event: MessageEvent<{ image: ImageData; settings: ScreenSettings }>) => {
  try {
    const result = renderHalftone(event.data.image, event.data.settings);
    (self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void }).postMessage({ result }, [result.data.buffer]);
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "No se pudo generar la trama." }); }
};
