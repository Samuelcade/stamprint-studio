import { defaultTraceOptions, TraceOptions, VectorResult, VectorSession } from "./vector";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validNumber = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
function readOptions(value: unknown): TraceOptions {
  if (!record(value)) throw new Error("Los ajustes guardados no son válidos.");
  const options = { ...defaultTraceOptions, ...value };
  if (!["color", "mono"].includes(options.mode) || typeof options.invert !== "boolean" || typeof options.removeWhite !== "boolean" ||
    !validNumber(options.colors, 2, 16) || !Number.isInteger(options.colors) || !validNumber(options.threshold, 1, 255) ||
    !validNumber(options.whiteTolerance, 0, 80) || !validNumber(options.alphaThreshold, 1, 254) || !validNumber(options.minArea, 0, 100) ||
    !validNumber(options.simplification, 0, 5) || ![512, 768, 1024, 1280, 2048].includes(options.resolution)) throw new Error("Los ajustes guardados no son válidos.");
  return options;
}
export function readVectorSession(value: unknown): VectorSession {
  if (!record(value) || typeof value.name !== "string" || typeof value.source !== "string" ||
    (value.source !== "" && !/^data:image\/(png|jpeg|webp);base64,/.test(value.source)) ||
    !validNumber(value.widthCm, .1, 300) || typeof value.smoothing !== "boolean") throw new Error("El trabajo vectorial guardado no es válido.");
  let result: VectorResult | undefined;
  if (value.result !== undefined) {
    const raw = value.result;
    if (!record(raw) || !validNumber(raw.width, 1, 2048) || !Number.isInteger(raw.width) || !validNumber(raw.height, 1, 2048) || !Number.isInteger(raw.height) || !Array.isArray(raw.paths) || raw.paths.length > 16) throw new Error("El vector guardado no es válido.");
    let count = 0; const ids = new Set<string>();
    for (const path of raw.paths) {
      if (!record(path) || typeof path.id !== "string" || ids.has(path.id) || typeof path.color !== "string" || !/^#[0-9a-f]{6}$/i.test(path.color) || typeof path.visible !== "boolean" || !Array.isArray(path.contours)) throw new Error("Un color guardado no es válido.");
      ids.add(path.id);
      for (const ring of path.contours) {
        if (!Array.isArray(ring) || ring.length < 3) throw new Error("Un contorno guardado no es válido.");
        count += ring.length; if (count > 60000) throw new Error("El vector guardado supera el límite de nodos.");
        for (const point of ring) if (!record(point) || !validNumber(point.x, 0, raw.width as number) || !validNumber(point.y, 0, raw.height as number)) throw new Error("Un nodo guardado no es válido.");
      }
    }
    result = raw as unknown as VectorResult;
  }
  return { name: value.name, source: value.source, widthCm: value.widthCm as number, smoothing: value.smoothing, options: readOptions(value.options), tracedOptions: value.tracedOptions === undefined ? undefined : readOptions(value.tracedOptions), result };
}
