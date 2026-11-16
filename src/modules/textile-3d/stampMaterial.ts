import * as THREE from "three";
import { stampDimensions, stampOrientation } from "./stampProjection";

/** One shared projector; moving it never rebuilds a mesh or recompiles a shader. */
export function createStampProjector() {
  const uniforms = {
    stampMap: { value: null as THREE.Texture | null },
    stampTransform: { value: new THREE.Matrix4() },
    stampEnabled: { value: 0 }, stampOpacity: { value: 1 },
    stampSide: { value: 1 }, stampMirror: { value: 0 },
  };
  const scale = new THREE.Vector3();
  return {
    uniforms,
    update(center: THREE.Vector3, size: number, aspect: number, rotation: number, side: 1 | -1, unitsPerCm: number) {
      const dimensions = stampDimensions(size, aspect, unitsPerCm);
      uniforms.stampTransform.value.compose(center, stampOrientation(rotation, side), scale.set(dimensions.width, dimensions.height, 1)).invert();
      uniforms.stampSide.value = side;
    },
    install(material: THREE.MeshStandardMaterial) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        const varyings = "\nvarying vec3 vStampPosition;\nvarying vec3 vStampNormal;\n";
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>" + varyings)
          .replace("#include <project_vertex>", `#include <project_vertex>
            vStampPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vStampNormal = inverseTransformDirection(transformedNormal, viewMatrix);
          `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
          ${varyings}
          uniform sampler2D stampMap;
          uniform mat4 stampTransform;
          uniform float stampEnabled, stampOpacity, stampSide, stampMirror;
        `).replace("#include <map_fragment>", `#include <map_fragment>
          if (stampEnabled > 0.5) {
            vec2 stampUv = (stampTransform * vec4(vStampPosition, 1.0)).xy + 0.5;
            float insideStamp = step(0.0, stampUv.x) * step(stampUv.x, 1.0)
              * step(0.0, stampUv.y) * step(stampUv.y, 1.0);
            float facingStamp = step(0.005, normalize(vStampNormal).z * stampSide);
            stampUv.x = mix(stampUv.x, 1.0 - stampUv.x, stampMirror);
            vec4 ink = texture2D(stampMap, clamp(stampUv, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb, ink.a * stampOpacity * insideStamp * facingStamp);
          }
        `);
      };
      material.customProgramCacheKey = () => "stamprint-gpu-projection-v1";
      material.needsUpdate = true;
    },
  };
}
