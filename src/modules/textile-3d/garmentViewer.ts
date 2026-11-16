import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MAX_STAMP_SIZE_CM, stampCorners } from "./stampProjection";
import { createStampProjector } from "./stampMaterial";
import { createSurfaceSampler } from "./surfaceSampler";

export interface StampSettings { size: number; rotation: number; aspect: number; opacity: number; mirrored: boolean; garmentHeightCm: number }
export interface ScreenPoint { x: number; y: number }
export interface StampOverlay { center: ScreenPoint; corners: ScreenPoint[]; rotate: ScreenPoint; visible: boolean }
export interface ModelData { source: ArrayBuffer | string; resources: Map<string, string> }
export type GestureMode = "move" | "resize" | "rotate";
export const HIDDEN_OVERLAY: StampOverlay = { center: { x: 0, y: 0 }, corners: [], rotate: { x: 0, y: 0 }, visible: false };

function disposeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse(item => {
    if (!(item instanceof THREE.Mesh)) return;
    item.geometry.dispose();
    (Array.isArray(item.material) ? item.material : [item.material]).forEach(material => materials.add(material));
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
}

export function createGarmentViewer(element: HTMLDivElement, initial: StampSettings, callbacks: {
  overlay: (overlay: StampOverlay) => void;
  transform: (size: number, rotation: number) => void;
  status: (message: string) => void;
}) {
  let disposed = false, modelVersion = 0, textureVersion = 0;
  let settings = { ...initial }, color = "#17191d", fabric = "Algodón";
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#101722");
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  element.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 2; controls.maxDistance = 12;
  scene.add(new THREE.HemisphereLight(0xf1f7ff, 0x454545, 2));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(4, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1); fill.position.set(-3, 2, -4); scene.add(fill);
  let current: THREE.Object3D | undefined, meshes: THREE.Mesh[] = [];
  let bounds = new THREE.Box3();
  let unitsPerCm = 3.5 / settings.garmentHeightCm;
  let sampleSurface: ReturnType<typeof createSurfaceSampler> | undefined;
  let preview = false, needsRender = true, recording = false;
  let center: THREE.Vector3 | undefined;
  let side: 1 | -1 = 1;
  let texture: THREE.Texture | null = null, dirty = false;
  const projector = createStampProjector();
  const invalidate = () => { needsRender = true; };
  controls.addEventListener("change", invalidate);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let gesture: { mode: GestureMode; point: THREE.Vector3; center: THREE.Vector3; size: number; rotation: number; distance: number; angle: number } | undefined;

  function resetView() {
    const size = bounds.isEmpty() ? new THREE.Vector3(3, 3.5, .5) : bounds.getSize(new THREE.Vector3());
    const middle = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = Math.max(size.y / (2 * tan * .88), size.x / (2 * tan * camera.aspect * .88));
    if (meshes.length) {
      // Fit the actual silhouette, rather than padding by the deepest sleeve.
      distance = 2;
      const point = new THREE.Vector3();
      for (const mesh of meshes) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(middle);
          distance = Math.max(distance, Math.abs(point.y) / (tan * .88) + point.z * side,
            Math.abs(point.x) / (tan * camera.aspect * .88) + point.z * side);
        }
      }
    }
    controls.target.copy(middle);
    camera.position.copy(middle).add(new THREE.Vector3(0, 0, distance * side));
    controls.update(); needsRender = true;
  }
  resetView();

  function appearance() {
    meshes.forEach(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.set(color); material.roughness = fabric === "Poliéster" ? .45 : .95; material.metalness = 0;
      }
    }));
    needsRender = true;
  }

  function centerStamp() {
    const hit = sampleSurface?.(0, .15, side);
    if (hit) { center = hit; dirty = true; }
  }

  function updateProjector() {
    dirty = false;
    projector.uniforms.stampEnabled.value = texture && center ? 1 : 0;
    if (center) projector.update(center, settings.size, settings.aspect, settings.rotation, side, unitsPerCm);
    needsRender = true;
  }

  function planePoint(event: PointerEvent) {
    if (!center) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, side), -(gesture?.center.z ?? center.z) * side), new THREE.Vector3());
  }

  function startGesture(mode: GestureMode, event: PointerEvent) {
    if (preview || event.button !== 0 || !center || !texture) return;
    const point = planePoint(event); if (!point) return;
    const delta = point.clone().sub(center);
    gesture = { mode, point, center: center.clone(), size: settings.size, rotation: settings.rotation, distance: delta.length(), angle: Math.atan2(delta.y, delta.x * side) };
    controls.enabled = false;
  }

  function applyGesture(event: PointerEvent) {
    if (!gesture) return;
    const point = planePoint(event); if (!point) return;
    if (gesture.mode === "move") {
      const candidate = gesture.center.clone().add(point.sub(gesture.point));
      const hit = sampleSurface?.(candidate.x, candidate.y, side);
      // Preserve the grab offset; clicking a corner must not jump the design center.
      if (hit) { center = hit; dirty = true; }
    } else {
      const delta = point.sub(gesture.center);
      if (gesture.mode === "resize") {
        settings.size = Math.round(THREE.MathUtils.clamp(gesture.size * delta.length() / Math.max(gesture.distance, .001), 1, MAX_STAMP_SIZE_CM) * 10) / 10;
      } else {
        const angle = Math.atan2(delta.y, delta.x * side);
        settings.rotation = Math.round(THREE.MathUtils.euclideanModulo(gesture.rotation - THREE.MathUtils.radToDeg(angle - gesture.angle) + 180, 360) - 180);
      }
      dirty = true; callbacks.transform(settings.size, settings.rotation);
    }
  }
  let pendingPointer: PointerEvent | undefined;
  function moveGesture(event: PointerEvent) { if (gesture) pendingPointer = event; }
  function endGesture() {
    if (pendingPointer) { applyGesture(pendingPointer); pendingPointer = undefined; }
    gesture = undefined; controls.enabled = true;
  }

  let lastOverlay = "";
  function updateOverlay() {
    let overlay = HIDDEN_OVERLAY;
    if (!preview && center && texture && camera.position.clone().sub(center).z * side > .2) {
      const rect = renderer.domElement.getBoundingClientRect();
      const project = (point: THREE.Vector3) => {
        const p = point.clone().project(camera);
        return { x: Math.round((p.x + 1) * rect.width / 2 * 10) / 10, y: Math.round((1 - p.y) * rect.height / 2 * 10) / 10 };
      };
      const corners = stampCorners(center, settings.size, settings.aspect, settings.rotation, side, unitsPerCm).map(project);
      const mid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
      const projectedCenter = project(center);
      const dx = mid.x - projectedCenter.x, dy = mid.y - projectedCenter.y, length = Math.max(1, Math.hypot(dx, dy));
      const clip = center.clone().project(camera);
      overlay = { center: projectedCenter, corners, rotate: { x: mid.x + dx / length * 28, y: mid.y + dy / length * 28 }, visible: clip.z > -1 && clip.z < 1 };
    }
    const snapshot = JSON.stringify(overlay);
    if (snapshot !== lastOverlay) { lastOverlay = snapshot; callbacks.overlay(overlay); }
  }

  const resize = () => {
    if (recording) return;
    const width = element.clientWidth, height = element.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); resetView();
  };
  const observer = new ResizeObserver(resize); observer.observe(element); resize();
  let frame = 0;
  function animate() {
    if (!recording) controls.update();
    if (pendingPointer) { applyGesture(pendingPointer); pendingPointer = undefined; }
    if (dirty) updateProjector();
    if (needsRender) { updateOverlay(); renderer.render(scene, camera); needsRender = false; }
    frame = requestAnimationFrame(animate);
  }
  animate();

  return {
    resetView, centerStamp, startGesture, moveGesture, endGesture,
    beginVideo(resolution: 1080 | 2160 = 1080) {
      if (!current) throw new Error("Espera a que cargue el modelo 3D.");
      endGesture();
      // Finish any orbit damping before saving the camera position.
      controls.update();
      controls.enabled = false;
      recording = true;
      const position = camera.position.clone();
      const target = controls.target.clone();
      const offset = position.clone().sub(target);
      const viewSize = renderer.getSize(new THREE.Vector2()), pixelRatio = renderer.getPixelRatio(), aspect = camera.aspect;
      const restore = () => {
        if (disposed) return;
        renderer.setPixelRatio(pixelRatio); renderer.setSize(viewSize.x, viewSize.y, false);
        camera.aspect = aspect; camera.updateProjectionMatrix();
        camera.position.copy(position); controls.target.copy(target);
        recording = false; controls.enabled = true; controls.update(); needsRender = true;
        if (element.clientWidth !== viewSize.x || element.clientHeight !== viewSize.y) resize();
      };
      // Render actual export pixels, independently of the viewport or screen density.
      try {
        renderer.setPixelRatio(1); renderer.setSize(resolution / 9 * 16, resolution, false);
        camera.aspect = 16 / 9; camera.updateProjectionMatrix();
      } catch { restore(); throw new Error("No se pudo preparar el video a esta resolución. Prueba con Full HD."); }
      return {
        canvas: renderer.domElement,
        rotate(progress: number) {
          camera.position.copy(offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), progress * Math.PI * 2).add(target);
          camera.lookAt(target);
          if (dirty) updateProjector();
          renderer.render(scene, camera);
        },
        restore,
      };
    },
    setPreview(value: boolean) { endGesture(); preview = value; needsRender = true; },
    setSide(next: 1 | -1) { side = next; endGesture(); centerStamp(); resetView(); },
    setAppearance(nextColor: string, nextFabric: string) { color = nextColor; fabric = nextFabric; appearance(); },
    setSettings(next: StampSettings) {
      settings = { ...next };
      unitsPerCm = (bounds.isEmpty() ? 3.5 : bounds.max.y - bounds.min.y) / settings.garmentHeightCm;
      projector.uniforms.stampOpacity.value = next.opacity;
      projector.uniforms.stampMirror.value = next.mirrored ? 1 : 0;
      dirty = true;
    },
    setTexture(source?: string) {
      const version = ++textureVersion;
      if (!source) { texture?.dispose(); texture = null; projector.uniforms.stampMap.value = null; dirty = true; return; }
      new THREE.TextureLoader().load(source, loaded => {
        if (disposed || version !== textureVersion) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        texture?.dispose(); texture = loaded; projector.uniforms.stampMap.value = loaded;
        if (!center) centerStamp(); dirty = true;
      }, undefined, () => { if (!disposed && version === textureVersion) callbacks.status("No se pudo cargar la imagen del diseño"); });
    },
    loadModel(model: ModelData) {
      const version = ++modelVersion;
      const loader = new GLTFLoader();
      loader.manager.setURLModifier(url => model.resources.get(decodeURIComponent(url.split("/").pop() ?? url)) ?? url);
      loader.parse(model.source, "", gltf => {
        if (disposed || version !== modelVersion) { disposeObject(gltf.scene); return; }
        if (current) { scene.remove(current); disposeObject(current); }
        current = gltf.scene; current.rotation.y = Math.PI / 2;
        meshes = []; current.traverse(item => { if (item instanceof THREE.Mesh) meshes.push(item); });
        current.updateWorldMatrix(true, true);
        // The bundled Sketchfab shirt has an arbitrary yaw. Face its named outer
        // front panel toward the printing plane; leave unknown imports as before.
        const front = meshes.find(mesh => mesh.parent?.name === "Body_Front_Node_4");
        if (front) {
          const p = front.geometry.getAttribute("position"), index = front.geometry.index;
          const normal = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
          for (let i = 0; i < (index?.count ?? p.count); i += 3) {
            a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(front.matrixWorld);
            b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(front.matrixWorld);
            c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(front.matrixWorld);
            normal.add(b.sub(a).cross(c.sub(a)));
          }
          current.rotation.y -= Math.atan2(normal.x, normal.z);
        }
        bounds = new THREE.Box3().setFromObject(current);
        const midpoint = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
        const scale = 3.5 / Math.max(size.x, size.y, size.z);
        current.scale.multiplyScalar(scale); current.position.sub(midpoint.multiplyScalar(scale));
        scene.add(current); current.updateWorldMatrix(true, true);
        bounds.setFromObject(current);
        unitsPerCm = (bounds.max.y - bounds.min.y) / settings.garmentHeightCm;
        sampleSurface = createSurfaceSampler(meshes, bounds);
        const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
        materials.forEach(material => { if (material instanceof THREE.MeshStandardMaterial) projector.install(material); });
        appearance(); centerStamp(); resetView(); dirty = true;
        callbacks.status("Camiseta 3D lista");
      }, () => { if (!disposed && version === modelVersion) callbacks.status("No se pudo leer el modelo GLB/GLTF"); });
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      if (current) disposeObject(current);
      texture?.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}

export type GarmentViewer = ReturnType<typeof createGarmentViewer>;
