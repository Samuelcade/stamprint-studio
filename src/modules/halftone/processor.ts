import { renderHalftone, ScreenSettings } from "./halftone";
export class HalftoneProcessor {
  private jobs = new Map<string, { worker: Worker; reject: (reason: Error) => void }>();
  cancel(key: string) {
    const job = this.jobs.get(key); if (!job) return;
    job.worker.terminate(); this.jobs.delete(key); job.reject(new Error("La trama fue reemplazada por un ajuste más reciente."));
  }
  async run(key: string, image: ImageData, settings: ScreenSettings): Promise<ImageData> {
    this.cancel(key);
    if (typeof Worker === "undefined") return renderHalftone(image, settings);
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./halftone.worker.ts", import.meta.url), { type: "module" });
      this.jobs.set(key, { worker, reject });
      const finish = () => { worker.terminate(); if (this.jobs.get(key)?.worker === worker) this.jobs.delete(key); };
      worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else { const result = event.data.result; resolve(new ImageData(result.data, result.width, result.height)); } };
      worker.onerror = event => { event.preventDefault(); finish(); reject(new Error("No se pudo generar la trama. Reduce su tamaño e inténtalo de nuevo.")); };
      try { worker.postMessage({ image, settings }, [image.data.buffer]); } catch (error) { finish(); reject(error); }
    });
  }
}
