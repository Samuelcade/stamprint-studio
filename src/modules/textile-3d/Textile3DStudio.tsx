import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { loadDefaultModel, saveDefaultModel } from "../storage/modelStore";
import { createGarmentViewer, GarmentViewer, GestureMode, HIDDEN_OVERLAY, ModelData, StampOverlay } from "./garmentViewer";
import { MAX_STAMP_SIZE_CM, stampDimensionsCm } from "./stampProjection";
import bundledShirtUrl from "../../../t_shirt.glb?url";
import { recordTurntable, supportedVideoFormats } from "./recordTurntable";

interface Props { designSource?: string; designSizeCm?: number }
const formatCm = (value: number) => value.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function Textile3DStudio({ designSource, designSizeCm }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<GarmentViewer | null>(null);
  const recordingAbort = useRef<AbortController | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(8);
  const [videoResolution, setVideoResolution] = useState<1080 | 2160>(1080);
  const formats = supportedVideoFormats();
  const [videoFormat, setVideoFormat] = useState("");
  const [modelData, setModelData] = useState<ModelData>();
  const [material, setMaterial] = useState("Algodón");
  const [garmentColor, setGarmentColor] = useState("#17191d");
  const [status, setStatus] = useState("Cargando camiseta 3D…");
  const [uploadedStampSource, setUploadedStampSource] = useState<string>();
  const [removeWhiteBackground, setRemoveWhiteBackground] = useState(false);
  const [stamp, setStamp] = useState<{ source: string; aspect: number }>();
  const [stampSize, setStampSize] = useState(18);
  const [stampRotation, setStampRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [mirrored, setMirrored] = useState(false);
  const [side, setSide] = useState<1 | -1>(1);
  const [preview, setPreview] = useState(false);
  const [garmentHeightCm, setGarmentHeightCm] = useState(70);
  const [overlay, setOverlay] = useState<StampOverlay>(HIDDEN_OVERLAY);
  const source = uploadedStampSource ?? designSource;
  const dimensions = stampDimensionsCm(stampSize, stamp?.aspect ?? 1);
  useEffect(() => {
    if (!uploadedStampSource && designSource && designSizeCm) setStampSize(Math.max(1, Math.min(MAX_STAMP_SIZE_CM, designSizeCm)));
  }, [designSource, designSizeCm, uploadedStampSource]);

  useEffect(() => {
    if (!host.current) return;
    const instance = createGarmentViewer(host.current, { size: 18, rotation: 0, aspect: 1, opacity: 1, mirrored: false, garmentHeightCm: 70 }, {
      overlay: setOverlay,
      transform: (size, rotation) => { setStampSize(size); setStampRotation(rotation); },
      status: setStatus,
    });
    viewer.current = instance;
    return () => { recordingAbort.current?.abort(); instance.dispose(); viewer.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const saved = await loadDefaultModel().catch(() => undefined);
      if (cancelled) return;
      if (saved) {
        setModelData({ source: saved.source, resources: new Map(saved.resources.map(item => [item.name, URL.createObjectURL(item.blob)])) });
      } else {
        const response = await fetch(bundledShirtUrl);
        if (!response.ok) throw new Error("Modelo no disponible");
        const buffer = await response.arrayBuffer();
        if (!cancelled) setModelData({ source: buffer, resources: new Map() });
      }
    }
    load().catch(() => { if (!cancelled) setStatus("No se pudo cargar la camiseta. Puedes importar un modelo GLB."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!modelData) return;
    viewer.current?.loadModel(modelData);
    return () => { modelData.resources.forEach(url => URL.revokeObjectURL(url)); };
  }, [modelData]);

  useEffect(() => {
    if (!source) { setStamp(undefined); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        let preparedSource = source;
        const previewScale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
        if (removeWhiteBackground || previewScale < 1) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * previewScale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * previewScale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas no disponible");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          if (removeWhiteBackground) {
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < pixels.data.length; i += 4) {
              if (pixels.data[i] >= 245 && pixels.data[i + 1] >= 245 && pixels.data[i + 2] >= 245) pixels.data[i + 3] = 0;
            }
            context.putImageData(pixels, 0, 0);
          }
          preparedSource = canvas.toDataURL("image/png");
        }
        setStamp({ source: preparedSource, aspect: image.naturalWidth / image.naturalHeight || 1 });
      } catch { setStatus("No se pudo procesar la imagen. Prueba con un PNG o JPG local."); }
    };
    image.onerror = () => { if (!cancelled) setStatus("La imagen no se pudo leer. Prueba con un PNG, JPG o WebP."); };
    image.src = source;
    return () => { cancelled = true; };
  }, [source, removeWhiteBackground]);

  useEffect(() => {
    viewer.current?.setSettings({ size: stampSize, rotation: stampRotation, aspect: stamp?.aspect ?? 1, opacity: opacity / 100, mirrored, garmentHeightCm });
  }, [stampSize, stampRotation, stamp?.aspect, opacity, mirrored, garmentHeightCm]);
  useEffect(() => { viewer.current?.setPreview(preview); }, [preview]);
  useEffect(() => { viewer.current?.setTexture(stamp?.source); }, [stamp?.source]);
  useEffect(() => { viewer.current?.setAppearance(garmentColor, material); }, [garmentColor, material]);

  async function importModel(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])]; event.target.value = "";
    if (!selected.length) return;
    try {
      const zipFile = selected.find(file => /\.zip$/i.test(file.name));
      let files: { name: string; blob: () => Promise<Blob>; text: () => Promise<string>; buffer: () => Promise<ArrayBuffer> }[];
      if (zipFile) {
        const archive = await JSZip.loadAsync(await zipFile.arrayBuffer());
        files = Object.values(archive.files).filter(entry => !entry.dir).map(entry => ({
          name: entry.name.split("/").pop()!, blob: () => entry.async("blob"), text: () => entry.async("string"), buffer: () => entry.async("arraybuffer"),
        }));
      } else files = selected.map(file => ({ name: file.name, blob: async () => file, text: () => file.text(), buffer: () => file.arrayBuffer() }));
      const primary = files.find(file => /\.glb$/i.test(file.name)) ?? files.find(file => /\.gltf$/i.test(file.name));
      if (!primary) { setStatus("El paquete no contiene un GLB/GLTF válido"); return; }
      const modelSource = /\.glb$/i.test(primary.name) ? await primary.buffer() : await primary.text();
      const resources = await Promise.all(files.filter(file => file !== primary).map(async file => ({ name: file.name, blob: await file.blob() })));
      await saveDefaultModel({ id: "default-shirt", source: modelSource, resources });
      setModelData({ source: modelSource, resources: new Map(resources.map(item => [item.name, URL.createObjectURL(item.blob)])) });
      setStatus("Modelo guardado localmente");
    } catch { setStatus("No se pudo importar o guardar el modelo seleccionado"); }
  }

  function importStamp(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setUploadedStampSource(String(reader.result)); setPreview(false); setStatus("Diseño listo"); };
    reader.onerror = () => setStatus("No se pudo abrir la imagen seleccionada");
    reader.readAsDataURL(file);
  }

  async function downloadVideo() {
    const format = formats.find(item => item.extension === videoFormat) ?? formats[0];
    if (!format || !viewer.current || recordingAbort.current) return;
    const controller = new AbortController();
    recordingAbort.current = controller;
    setRecording(true); setVideoProgress(0);
    try {
      const view = viewer.current.beginVideo(videoResolution);
      const blob = await recordTurntable(view, format.mime, videoDuration, controller.signal, setVideoProgress);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `stamprint-giro-360.${format.extension}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus(`Video ${format.label} ${videoResolution === 2160 ? "4K" : "Full HD"} descargado a 30 FPS.`);
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : "No se pudo crear el video.");
      else if (viewer.current) setStatus("Grabación cancelada.");
    } finally {
      if (recordingAbort.current === controller) recordingAbort.current = null;
      if (viewer.current) setRecording(false);
    }
  }

  const gestureEvents = (mode: GestureMode) => ({
    onPointerDown: (event: ReactPointerEvent<Element>) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      viewer.current?.startGesture(mode, event.nativeEvent);
    },
    onPointerMove: (event: ReactPointerEvent<Element>) => viewer.current?.moveGesture(event.nativeEvent),
    onPointerUp: (event: ReactPointerEvent<Element>) => {
      viewer.current?.endGesture();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => viewer.current?.endGesture(),
    onLostPointerCapture: () => viewer.current?.endGesture(),
  });

  return <div className="three-studio">
    <div className="three-toolbar" inert={recording}>
      <label className="file-action">Cambiar modelo<input type="file" multiple accept=".zip,.glb,.gltf,model/gltf-binary,model/gltf+json" onChange={importModel} /></label>
      <label className="file-action">Cargar diseño<input type="file" accept="image/png,image/jpeg,image/webp" onChange={importStamp} /></label>
      <label>Color<input type="color" value={garmentColor} onInput={event => setGarmentColor(event.currentTarget.value)} onChange={event => setGarmentColor(event.target.value)} /></label>
      <label>Tejido<select value={material} onChange={event => setMaterial(event.target.value)}><option>Algodón</option><option>Poliéster</option></select></label>
      <label>Estampar en<select value={side} onChange={event => { const next = Number(event.target.value) as 1 | -1; setSide(next); viewer.current?.setSide(next); }}><option value="1">Frente</option><option value="-1">Espalda</option></select></label>
      <button onClick={() => viewer.current?.resetView()}>Restablecer vista</button>
      <button className="preview-toggle" disabled={!stamp} aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? "Editar diseño" : "Vista limpia"}</button>
    </div>
    <div className="stamp-controls" inert={recording}>
      <h2>Diseño y medidas</h2>
      <div className="stamp-dimensions" aria-label="Medidas del estampado">
        <div><span>Ancho</span><output aria-label="Ancho del diseño">{stamp ? formatCm(dimensions.width) : "—"}<small> cm</small></output></div>
        <div><span>Alto</span><output aria-label="Alto del diseño">{stamp ? formatCm(dimensions.height) : "—"}<small> cm</small></output></div>
      </div>
      <span className="stamp-proportions">Proporciones bloqueadas</span>
      <label title="Ajusta el lado mayor; ancho y alto se calculan conservando la proporción">Tamaño <input aria-label="Tamaño del diseño" type="range" min="1" max={MAX_STAMP_SIZE_CM} step="0.1" value={stampSize} disabled={!stamp} onChange={event => setStampSize(Number(event.target.value))} /><output>{formatCm(stampSize)} cm</output></label>
      <label>Rotación <input aria-label="Rotación del diseño" type="range" min="-180" max="180" value={stampRotation} disabled={!stamp} onChange={event => setStampRotation(Number(event.target.value))} />{stampRotation}°</label>
      <label>Opacidad <input aria-label="Opacidad del diseño" type="range" min="0" max="100" value={opacity} disabled={!stamp} onChange={event => setOpacity(Number(event.target.value))} />{opacity}%</label>
      <div className="stamp-actions"><button disabled={!stamp} onClick={() => viewer.current?.centerStamp()}>Centrar diseño</button>
      <button disabled={!stamp} aria-pressed={mirrored} onClick={() => setMirrored(value => !value)}>Espejar</button></div>
      {source && <label title="Elimina también los detalles blancos del diseño; usa un PNG transparente para conservarlos."><input type="checkbox" checked={removeWhiteBackground} onChange={event => setRemoveWhiteBackground(event.target.checked)} />Quitar blancos</label>}
      <div className="garment-calibration">
        <label>Alto de camiseta <input aria-label="Alto de camiseta en centímetros" type="number" min="20" max="140" step="0.1" defaultValue="70" onBlur={event => {
          const value = Number(event.currentTarget.value);
          const next = Number.isFinite(value) && value >= 20 && value <= 140 ? value : garmentHeightCm;
          setGarmentHeightCm(next); event.currentTarget.value = String(next);
        }} /> cm</label>
        <p>Del hombro al borde inferior. Ajusta esta medida a tu prenda para calibrar la vista 3D.</p>
      </div>
    </div>
    <div className="three-canvas" ref={host}>
      {stamp && !preview && !recording && overlay.visible && <div className="stamp-handles">
        <svg className="stamp-outline">
          <polygon className="stamp-drag" points={overlay.corners.map(point => `${point.x},${point.y}`).join(" ")} {...gestureEvents("move")} />
          <line x1={(overlay.corners[0].x + overlay.corners[1].x) / 2} y1={(overlay.corners[0].y + overlay.corners[1].y) / 2} x2={overlay.rotate.x} y2={overlay.rotate.y} />
        </svg>
        <button className="stamp-rotate" style={{ left: overlay.rotate.x, top: overlay.rotate.y }} aria-label="Rotar diseño" {...gestureEvents("rotate")} />
        {overlay.corners.map((point, index) => <button key={index} className={`stamp-resize stamp-corner-${index}`} style={{ left: point.x, top: point.y }} aria-label={`Cambiar tamaño desde esquina ${index + 1}`} {...gestureEvents("resize")} />)}
      </div>}
      {!preview && !recording && <div className="three-hint">{stamp ? "Arrastra el diseño · Esquinas para escalar · Control superior para girar" : "Carga una imagen PNG, JPG o WebP para empezar"}<span>Arrastra fuera del diseño para girar la prenda · Rueda para acercar</span></div>}
    </div>
    <div className="video-controls">
      <h2>Video 360°</h2>
      <p>Graba un giro completo con el diseño y la vista actuales.</p>
      {formats.length ? <>
        <label>Duración <select disabled={recording} value={videoDuration} onChange={event => setVideoDuration(Number(event.target.value))}><option value="5">5 segundos</option><option value="8">8 segundos</option><option value="12">12 segundos</option><option value="15">15 segundos</option></select></label>{" "}
        <label>Formato <select disabled={recording} value={videoFormat || formats[0].extension} onChange={event => setVideoFormat(event.target.value)}>{formats.map(format => <option key={format.extension} value={format.extension}>{format.label}</option>)}</select></label>{" "}
        <label>Calidad <select disabled={recording} value={videoResolution} onChange={event => setVideoResolution(Number(event.target.value) as 1080 | 2160)}><option value="1080">Full HD · 1920 × 1080</option><option value="2160">4K · 3840 × 2160</option></select></label>{" "}
        {recording ? <><button onClick={() => recordingAbort.current?.abort()}>Cancelar grabación</button> <span role="status">Grabando {Math.round(videoProgress * 100)} %</span></> : <button onClick={downloadVideo}>Crear y descargar video 360°</button>}
        <p>Video a 30 FPS con alta tasa de bits. La resolución no depende del tamaño de la ventana. Mantén la aplicación visible; 4K requiere más rendimiento y genera archivos más grandes.</p>
      </> : <p>Tu navegador no permite grabar video de la vista 3D. Prueba con una versión reciente de Chrome, Edge o Safari.</p>}
    </div>
    <p className="three-footer"><span role="status">{status}</span> · Medidas del archivo completo, incluidos los márgenes transparentes. Vista orientativa según la altura de camiseta indicada.</p>
  </div>;
}
