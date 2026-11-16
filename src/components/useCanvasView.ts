import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };
export const clampZoom = (zoom: number) => Math.max(.25, Math.min(8, zoom));
export function viewGeometry(width: number, height: number, viewport: Point, zoom: number) {
  const scale = Math.max(.001, Math.min((viewport.x - 48) / width, (viewport.y - 48) / height)) * zoom;
  const space = { width: Math.max(viewport.x, width * scale + 48), height: Math.max(viewport.y, height * scale + 48) };
  return { scale, space, offset: { x: (space.width - width * scale) / 2, y: (space.height - height * scale) / 2 } };
}

/** View transforms never change document geometry or add undo entries. */
export function useCanvasView(width: number, height: number, cancelEdit: () => void) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 800, y: 600 });
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState(false);
  const geometry = viewGeometry(width, height, viewport, zoom);
  const current = useRef({ zoom, geometry, cancelEdit }); current.current = { zoom, geometry, cancelEdit };
  const anchor = useRef<{ point: Point; screen: Point } | undefined>(undefined);
  const touches = useRef(new Map<number, Point>());
  const gesture = useRef<{ kind: "pinch" | "pan" | "ending"; distance: number; zoom: number; start: Point; scroll: Point; point: Point } | undefined>(undefined);

  useEffect(() => {
    const cancel = () => { touches.current.clear(); gesture.current = undefined; anchor.current = undefined; current.current.cancelEdit(); };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);

  useEffect(() => {
    const element = viewportRef.current; if (!element) return;
    const measure = () => { if (element.clientWidth && element.clientHeight) setViewport({ x: element.clientWidth, y: element.clientHeight }); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function zoomTo(value: number, screen?: Point) {
    const element = viewportRef.current; if (!element) return;
    const at = screen ?? { x: element.clientWidth / 2, y: element.clientHeight / 2 }, g = current.current.geometry;
    anchor.current = { screen: at, point: { x: (element.scrollLeft + at.x - g.offset.x) / g.scale, y: (element.scrollTop + at.y - g.offset.y) / g.scale } };
    setZoom(clampZoom(value));
  }
  useLayoutEffect(() => {
    const element = viewportRef.current, target = anchor.current;
    if (element && target) { element.scrollLeft = target.point.x * geometry.scale + geometry.offset.x - target.screen.x; element.scrollTop = target.point.y * geometry.scale + geometry.offset.y - target.screen.y; anchor.current = undefined; }
  }, [zoom, width, height, viewport]);
  useEffect(() => {
    const element = viewportRef.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); current.current.cancelEdit();
      const rect = element.getBoundingClientRect();
      zoomTo(current.current.zoom * Math.exp(-event.deltaY * .008), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function local(event: ReactPointerEvent) { const rect = viewportRef.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function stop(event: ReactPointerEvent) { event.preventDefault(); event.stopPropagation(); }
  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") touches.current.set(event.pointerId, local(event));
    const element = viewportRef.current!;
    if (touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, g = current.current.geometry;
      current.current.cancelEdit(); stop(event);
      gesture.current = { kind: "pinch", distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: current.current.zoom, start: mid, scroll: { x: element.scrollLeft, y: element.scrollTop }, point: { x: (element.scrollLeft + mid.x - g.offset.x) / g.scale, y: (element.scrollTop + mid.y - g.offset.y) / g.scale } };
      for (const id of touches.current.keys()) element.setPointerCapture(id);
    } else if (pan || event.button === 1) {
      current.current.cancelEdit(); stop(event); element.setPointerCapture(event.pointerId);
      gesture.current = { kind: "pan", distance: 1, zoom, start: local(event), scroll: { x: element.scrollLeft, y: element.scrollTop }, point: { x: 0, y: 0 } };
    }
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, local(event));
    const state = gesture.current, element = viewportRef.current; if (!state || !element) return;
    stop(event);
    if (state.kind === "pinch" && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = clampZoom(state.zoom * Math.hypot(a.x - b.x, a.y - b.y) / state.distance);
      const nextGeometry = viewGeometry(width, height, viewport, next);
      // Also pan when fingers move together without changing their distance.
      element.scrollLeft = state.point.x * nextGeometry.scale + nextGeometry.offset.x - mid.x;
      element.scrollTop = state.point.y * nextGeometry.scale + nextGeometry.offset.y - mid.y;
      anchor.current = { point: state.point, screen: mid }; setZoom(next);
    } else if (state.kind === "pan") { const p = local(event); element.scrollLeft = state.scroll.x + state.start.x - p.x; element.scrollTop = state.scroll.y + state.start.y - p.y; }
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    touches.current.delete(event.pointerId);
    if (gesture.current) { stop(event); if (touches.current.size) gesture.current.kind = "ending"; else gesture.current = undefined; }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function reset() { current.current.cancelEdit(); anchor.current = { point: { x: width / 2, y: height / 2 }, screen: { x: viewport.x / 2, y: viewport.y / 2 } }; setZoom(1); if (viewportRef.current) { viewportRef.current.scrollLeft = 0; viewportRef.current.scrollTop = 0; } }
  return { viewportRef, zoom, pan, scale: geometry.scale, space: geometry.space, zoomTo, reset, togglePan: () => { current.current.cancelEdit(); setPan(value => !value); }, events: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: up, onPointerCancelCapture: up } };
}
