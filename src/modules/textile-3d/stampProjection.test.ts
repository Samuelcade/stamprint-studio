import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { stampCorners, stampDimensions, stampDimensionsCm } from "./stampProjection";
import { createStampProjector } from "./stampMaterial";
import { createSurfaceSampler } from "./surfaceSampler";

function panel(x: number, z: number, back = false) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 3, 4, 4));
  mesh.position.set(x, 0, z);
  if (back) mesh.rotation.y = Math.PI;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("GPU garment stamp projection", () => {
  it.each([.5, 1, 2])("preserves aspect %s in centimeters and calibrated world units", aspect => {
    const cm = stampDimensionsCm(24, aspect);
    const world = stampDimensions(24, aspect, 3.5 / 70);
    expect(cm.width / cm.height).toBeCloseTo(aspect);
    expect(Math.max(cm.width, cm.height)).toBe(24);
    expect(world.width).toBeCloseTo(cm.width * .05);
    expect(world.height).toBeCloseTo(cm.height * .05);
  });

  it("calculates portrait and landscape sizes without swapping them on rotation", () => {
    expect(stampDimensionsCm(30, 2 / 3)).toEqual({width: 20, height: 30});
    expect(stampDimensionsCm(30, 3 / 2)).toEqual({width: 30, height: 20});
  });

  it.each([1, -1] as const)("maps all selection corners to the same shader rectangle on side %s", side => {
    const center = new THREE.Vector3(.2, .3, .4);
    const projector = createStampProjector();
    const expected = [[-.5, .5], [.5, .5], [.5, -.5], [-.5, -.5]];
    for (const rotation of [-180, -45, 0, 24, 90]) {
      projector.update(center, 30, 2 / 3, rotation, side, .05);
      stampCorners(center, 30, 2 / 3, rotation, side, .05).forEach((corner, index) => {
        corner.applyMatrix4(projector.uniforms.stampTransform.value);
        expect(corner.x).toBeCloseTo(expected[index][0]);
        expect(corner.y).toBeCloseTo(expected[index][1]);
      });
    }
  });

  it("covers separate panels and deep folds using the same projection", () => {
    const meshes = [panel(-.5, -.35), panel(.5, .35)];
    const bounds = new THREE.Box3(); meshes.forEach(mesh => bounds.expandByObject(mesh));
    const sample = createSurfaceSampler(meshes, bounds);
    expect(sample(-.25, 0, 1)?.z).toBeCloseTo(-.35);
    expect(sample(.25, 0, 1)?.z).toBeCloseTo(.35);
    expect(sample(2, 0, 1)).toBeUndefined();
    const projector = createStampProjector(); projector.update(new THREE.Vector3(), 24, 1, 0, 1, .05);
    for (const z of [-.35, 0, .35]) {
      const p = new THREE.Vector3(.3, .3, z).applyMatrix4(projector.uniforms.stampTransform.value);
      expect(p.x).toBeCloseTo(.25); expect(p.y).toBeCloseTo(.25);
    }
  });

  it("finds the outermost surface separately for front and back", () => {
    const meshes = [panel(0, .25), panel(0, -.25, true), panel(0, .1), panel(0, -.1, true)];
    const bounds = new THREE.Box3(); meshes.forEach(mesh => bounds.expandByObject(mesh));
    const sample = createSurfaceSampler(meshes, bounds);
    expect(sample(0, 0, 1)?.z).toBeCloseTo(.25);
    expect(sample(0, 0, -1)?.z).toBeCloseTo(-.25);
  });

  it("matches ray intersections on a transformed sloping surface", () => {
    const mesh = panel(0, .25);
    mesh.rotation.y = .3; mesh.scale.set(1.2, .8, 1); mesh.updateMatrixWorld(true);
    const sample = createSurfaceSampler([mesh], new THREE.Box3().setFromObject(mesh));
    const ray = new THREE.Raycaster();
    for (const x of [-.4, -.1, 0, .2, .4]) {
      ray.set(new THREE.Vector3(x, .1, 5), new THREE.Vector3(0, 0, -1));
      const expected = ray.intersectObject(mesh)[0].point;
      expect(sample(x, .1, 1)?.distanceTo(expected)).toBeLessThan(1e-7);
    }
  });

  it("updates existing uniforms without reallocating the projector", () => {
    const projector = createStampProjector(), transform = projector.uniforms.stampTransform.value;
    for (let i = 0; i < 100; i++) projector.update(new THREE.Vector3(i / 100, 0, 0), 20, .5, i, 1, .05);
    expect(projector.uniforms.stampTransform.value).toBe(transform);
  });
});
