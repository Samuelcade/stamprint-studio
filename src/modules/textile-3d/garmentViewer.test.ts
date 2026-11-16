// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createGarmentViewer } from "./garmentViewer";

vi.mock("three", async importOriginal => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement("canvas");
    ratio = 1; size = new actual.Vector2();
    setPixelRatio(value: number) { this.ratio = value; this.setSize(this.size.x, this.size.y); }
    getPixelRatio() { return this.ratio; }
    setSize(width: number, height: number) { this.size.set(width, height); this.domElement.width = width * this.ratio; this.domElement.height = height * this.ratio; }
    getSize(target: THREE.Vector2) { return target.copy(this.size); }
    render() {} dispose() {}
  } };
});
vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({ OrbitControls: class {
  target = new THREE.Vector3(); enabled = true;
  addEventListener() {} update() {} dispose() {}
} }));
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({ GLTFLoader: class {
  manager = { setURLModifier() {} };
  parse(_source: unknown, _path: string, loaded: (gltf: { scene: THREE.Group }) => void) {
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, .5), new THREE.MeshStandardMaterial())); loaded({ scene });
  }
} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([1080, 2160] as const)("exports actual %ip pixels and protects the resolution from viewport resizing", resolution => {
  vi.stubGlobal("devicePixelRatio", 1.5);
  vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  let resized = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {} disconnect() {}
  });
  const element = document.createElement("div");
  Object.defineProperties(element, { clientWidth: { configurable: true, value: 800 }, clientHeight: { configurable: true, value: 600 } });
  const viewer = createGarmentViewer(element, { size: 18, rotation: 0, aspect: 1, opacity: 1, mirrored: false, garmentHeightCm: 70 }, { overlay: vi.fn(), transform: vi.fn(), status: vi.fn() });
  viewer.loadModel({ source: "test-model", resources: new Map() });
  const canvas = element.querySelector("canvas")!;
  expect([canvas.width, canvas.height]).toEqual([1200, 900]);
  const video = viewer.beginVideo(resolution); video.rotate(.5);
  expect([canvas.width, canvas.height]).toEqual([resolution / 9 * 16, resolution]);
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 640 }); resized();
  expect([canvas.width, canvas.height]).toEqual([resolution / 9 * 16, resolution]);
  video.restore(); expect([canvas.width, canvas.height]).toEqual([960, 900]);
  const second = viewer.beginVideo(resolution); second.rotate(1); second.restore();
  expect([canvas.width, canvas.height]).toEqual([960, 900]);
  viewer.dispose();
});
