export interface VideoTurntable {
  canvas: HTMLCanvasElement;
  rotate(progress: number): void;
  restore(): void;
}

export function supportedVideoFormats() {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return [];
  return [
    { label: "WebM", mime: "video/webm;codecs=vp9", extension: "webm" },
    { label: "WebM", mime: "video/webm;codecs=vp8", extension: "webm" },
    { label: "WebM", mime: "video/webm", extension: "webm" },
    { label: "MP4", mime: "video/mp4", extension: "mp4" },
  ].filter((format, index, all) => MediaRecorder.isTypeSupported(format.mime) &&
    all.findIndex(candidate => candidate.extension === format.extension && MediaRecorder.isTypeSupported(candidate.mime)) === index);
}

export function recordTurntable(view: VideoTurntable, mime: string, duration: number, signal: AbortSignal, progress: (value: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    let frame = 0, finished = false, completed = false;
    const chunks: Blob[] = [];
    const cleanup = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", cancel);
      document.removeEventListener("visibilitychange", visibility);
      stream?.getTracks().forEach(track => track.stop());
      view.restore();
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      cleanup(); reject(new Error(message));
    };
    const cancel = () => fail("Grabación cancelada.");
    const visibility = () => { if (document.hidden) fail("La grabación se interrumpió al salir de la pantalla. Mantén la aplicación visible e inténtalo de nuevo."); };
    try {
      if (signal.aborted) { cancel(); return; }
      view.rotate(0);
      stream = view.canvas.captureStream(30);
      const bitrate = Math.min(64_000_000, Math.max(8_000_000, Math.round(view.canvas.width * view.canvas.height * 30 * .25)));
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => fail("No se pudo grabar el video en este navegador.");
      recorder.onstop = () => {
        if (finished) return;
        finished = true; cleanup();
        if (completed && chunks.length) resolve(new Blob(chunks, { type: recorder?.mimeType || mime }));
        else reject(new Error("No se pudo generar el video."));
      };
      signal.addEventListener("abort", cancel, { once: true });
      document.addEventListener("visibilitychange", visibility);
      recorder.start();
      const start = performance.now();
      const tick = (now: number) => {
        const fraction = Math.min(1, (now - start) / (duration * 1000));
        view.rotate(fraction); progress(fraction);
        if (fraction >= 1) { completed = true; recorder?.stop(); }
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } catch {
      fail("No se pudo iniciar la grabación. Prueba otro formato o navegador.");
    }
  });
}
