import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { QualitySize } from "../image-enhancement/quality";
import { qualityDimensions } from "../image-enhancement/quality";
import { downloadFile } from "./io";

type Result = { blob: Blob; url: string; width: number; height: number; name: string };
export function ImageEnhancer({ initialSource, initialName, onBack }: { initialSource: string; initialName: string; onBack: () => void }) {
  const [source, setSource] = useState(initialSource), [name, setName] = useState(initialName || "imagen");
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [size, setSize] = useState<QualitySize>("8k"), [result, setResult] = useState<Result>();
  const [progress, setProgress] = useState<number | null>(null), [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null), version = useRef(0), resultUrl = useRef("");
  const reader = useRef<FileReader | null>(null);
  useEffect(() => () => { version.current++; worker.current?.terminate(); reader.current?.abort(); if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); }, []);
  function clearResult() { if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); resultUrl.current = ""; setResult(undefined); }
  function stop() { version.current++; worker.current?.terminate(); worker.current = null; setProgress(null); }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Elige una imagen PNG, JPG o WebP."); return; }
    stop(); reader.current?.abort(); clearResult(); setError(""); setDimensions(undefined); setSource("");
    const task = new FileReader(); reader.current = task;
    task.onload = () => { if (reader.current !== task) return; reader.current = null; setSource(String(task.result)); setName(file.name.replace(/\.[^.]+$/, "") || "imagen"); };
    task.onerror = () => { if (reader.current === task) { reader.current = null; setError("No se pudo abrir la imagen."); } };
    task.readAsDataURL(file);
  }
  let target: { width: number; height: number } | undefined;
  try { if (dimensions) target = qualityDimensions(dimensions.width, dimensions.height, size); } catch { /* The input warning is displayed below. */ }
  function run() {
    if (!source || !target || worker.current) return;
    clearResult(); setError(""); setProgress(0); setStage("Preparando imagen");
    const id = ++version.current;
    try {
      const task = new Worker(new URL("../image-enhancement/quality.worker.ts", import.meta.url), { type: "module" }); worker.current = task;
      task.onmessage = event => {
        if (version.current !== id) return;
        const message = event.data;
        if (message.type === "progress") { setProgress(message.progress); setStage(message.stage); }
        else if (message.type === "done") {
          task.terminate(); worker.current = null; setProgress(null);
          const url = URL.createObjectURL(message.blob); resultUrl.current = url;
          const filename = `${name.replace(/[<>:"/\\|?*]/g, "_") || "imagen"}-mejorada-${message.width}x${message.height}.png`;
          setResult({ blob: message.blob, url, width: message.width, height: message.height, name: filename });
          downloadFile(message.blob, filename);
        } else if (message.type === "error") { setError(message.message || "No se pudo mejorar la imagen."); stop(); }
      };
      task.onerror = event => { event.preventDefault(); if (version.current === id) { setError("No se pudo procesar la imagen. Prueba 4K o una imagen más pequeña."); stop(); } };
      task.postMessage({ source, mask: "", size, strength: 35 });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo iniciar la mejora."); stop(); }
  }
  return <div className="enhance-simple">
    <div className="enhance-heading"><div><p className="eyebrow">MEJORA DE IMAGEN</p><h1>Mejorar calidad</h1><p>Elige una calidad y descarga tu imagen mejorada en PNG.</p></div><button onClick={onBack}>← Volver a vectorización</button></div>
    <div className="enhance-content"><div className="enhance-controls">
      <label className="enhance-upload">{source ? "Cambiar imagen" : "Cargar imagen"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={progress !== null} onChange={upload} /></label>
      <label>Calidad de salida<select value={size} disabled={progress !== null} onChange={event => { setSize(event.target.value as QualitySize); clearResult(); setError(""); }}><option value="8k">Máxima · 8K (7680 px)</option><option value="4k">Alta · 4K (4096 px)</option><option value="2x">Ampliar 2× (hasta 4096 px)</option><option value="original">Mejorar nitidez sin ampliar</option></select></label>
      {dimensions && <p>Original: <strong>{dimensions.width} × {dimensions.height} px</strong></p>}
      {target && <p>Resultado: <strong>{target.width} × {target.height} px</strong></p>}
      {dimensions && !target && <p className="enhance-error" role="alert">La imagen supera 4096 píxeles por lado. Usa una imagen de hasta 4096 px por lado.</p>}
      {progress !== null ? <div className="enhance-progress"><progress max="100" value={progress} /><p role="status">{stage} · {progress}%</p><button onClick={stop}>Cancelar mejora</button></div> : <button className="accent enhance-run" disabled={!target} onClick={run}>✦ Mejorar y descargar</button>}
      {result && <button onClick={() => downloadFile(result.blob, result.name)}>Descargar otra vez</button>}
      {error && <p className="enhance-error" role="alert">{error}</p>}
      <p className="enhance-note">La mejora usa ampliación bicúbica y nitidez local, sin IA. No reconstruye detalles perdidos. 8K puede tardar y consumir bastante memoria.</p>
    </div><div className="enhance-preview">{source ? <><div className="enhance-preview-label">{result ? `IMAGEN MEJORADA · ${result.width} × ${result.height} PX` : "IMAGEN ORIGINAL"}</div><img key={result?.url || source} src={result?.url || source} alt={result ? "Imagen mejorada" : "Imagen original"} onLoad={event => { if (!result) { const image = event.currentTarget; setDimensions({ width: image.naturalWidth, height: image.naturalHeight }); } }} onError={() => { if (!result) { setDimensions(undefined); setError("No se pudo abrir la imagen."); } }} /></> : <div className="enhance-empty">Carga una imagen para comenzar.</div>}</div></div>
  </div>;
}
