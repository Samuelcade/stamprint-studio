import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { alphaBounds } from "./crop";
import type { CropRect } from "./crop";
import type { Design } from "./layout";

function PixelField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label} (px)<input type="number" min={min} max={max} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { const parsed = Number(draft); const next = draft.trim() && Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : value; setDraft(String(next)); onCommit(next); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function CropDialog({ item, onCancel, onApply }: { item: Design; onCancel: () => void; onApply: (rect: CropRect, width: number, height: number, source: string) => void }) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [rect, setRect] = useState<CropRect>();
  const [message, setMessage] = useState("Arrastra sobre la imagen para seleccionar el área que quieres conservar.");
  const stage = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const img = new Image(); img.onload = () => { setImage(img); setRect({ x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }); }; img.onerror = () => setMessage("No se pudo abrir la imagen."); img.src = item.source;
    return () => { img.onload = null; img.onerror = null; };
  }, [item.source]);
  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = stage.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(image!.naturalWidth, (event.clientX - bounds.left) / bounds.width * image!.naturalWidth)), y: Math.max(0, Math.min(image!.naturalHeight, (event.clientY - bounds.top) / bounds.height * image!.naturalHeight)) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current || !image) return;
    const p = point(event), s = start.current;
    const x = Math.min(image.naturalWidth - 1, Math.floor(Math.min(s.x, p.x))), y = Math.min(image.naturalHeight - 1, Math.floor(Math.min(s.y, p.y)));
    setRect({ x, y, width: Math.max(1, Math.min(image.naturalWidth - x, Math.ceil(Math.max(s.x, p.x)) - x)), height: Math.max(1, Math.min(image.naturalHeight - y, Math.ceil(Math.max(s.y, p.y)) - y)) });
  }
  function automatic() {
    if (!image) return;
    try {
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo analizar la imagen.");
      ctx.drawImage(image, 0, 0); const bounds = alphaBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (!bounds) { setMessage("La imagen está completamente transparente y no tiene contenido para recortar."); return; }
      setRect(bounds); setMessage(bounds.width === canvas.width && bounds.height === canvas.height ? "El contenido llega a los bordes: no hay márgenes transparentes que eliminar." : "Selección ajustada a todos los píxeles visibles. Puedes modificarla arrastrando.");
    } catch (error) { setMessage((error as Error).message); }
  }
  function apply() {
    if (!image || !rect) return;
    try {
      const canvas = document.createElement("canvas"); canvas.width = rect.width; canvas.height = rect.height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo recortar la imagen.");
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      onApply(rect, image.naturalWidth, image.naturalHeight, canvas.toDataURL("image/png"));
    } catch (error) { setMessage((error as Error).message); }
  }
  return <div className="crop-backdrop" role="presentation"><div className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
    <div className="crop-heading"><div><h2 id="crop-title">Recortar diseño</h2><p>{item.name}</p></div><button onClick={onCancel} aria-label="Cerrar recorte">✕</button></div>
    <p className="crop-help">El recorte automático elimina márgenes transparentes. Para el manual, arrastra un rectángulo sobre el área que quieres conservar.</p>
    <div className="crop-preview">{image && rect && <div className="crop-stage" ref={stage} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); move(event); }} onPointerMove={move} onPointerUp={event => { move(event); start.current = null; }} onPointerCancel={() => { start.current = null; }}><img src={item.source} alt="Imagen para recortar" draggable={false} /><div className="crop-selection" style={{ left: `${rect.x / image.naturalWidth * 100}%`, top: `${rect.y / image.naturalHeight * 100}%`, width: `${rect.width / image.naturalWidth * 100}%`, height: `${rect.height / image.naturalHeight * 100}%` }} /></div>}</div>
    <p className="crop-help" role="status">{message}</p>
    {image && rect && <div className="crop-fields">{([ ["Izquierda", "x"], ["Arriba", "y"], ["Ancho", "width"], ["Alto", "height"] ] as const).map(([label, key]) => <PixelField key={key} label={label} min={key === "x" || key === "y" ? 0 : 1} max={key === "x" ? image.naturalWidth - rect.width : key === "y" ? image.naturalHeight - rect.height : key === "width" ? image.naturalWidth - rect.x : image.naturalHeight - rect.y} value={rect[key]} onCommit={value => setRect(previous => previous && ({ ...previous, [key]: value }))} />)}</div>}
    <div className="crop-actions"><button disabled={!image} onClick={automatic}>Ajustar a contenido visible</button><button disabled={!image} onClick={() => image && setRect({ x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight })}>Seleccionar imagen completa</button><span /><button onClick={onCancel}>Cancelar</button><button className="accent" disabled={!image || !rect} onClick={apply}>Aplicar recorte</button></div>
  </div></div>;
}
