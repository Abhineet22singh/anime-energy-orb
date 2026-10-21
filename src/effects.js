/**
 * effects.js – Post-processing (bloom, color grading) and arc effects
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// ── Transparent VFX Enhance Shader (Guarantees zero interference with live camera feed) ──
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.15 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uIntensity;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // Strictly discard empty background pixels so the live webcam video & face stay crystal clear
      if (col.a <= 0.002) {
        discard;
      }

      // Subtle vibrance boost on energy pixels only
      col.rgb += vec3(0.0, 0.02, 0.05) * col.a * uIntensity;
      gl_FragColor = col;
    }
  `,
};

/**
 * Create the post-processing pipeline.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 */
export function createPostProcessing(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  renderPass.clear = false;         // don't clear – we want the camera feed behind
  renderPass.clearDepth = true;
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.2,   // strength
    0.5,   // radius
    0.2    // threshold
  );
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(gradePass);

  return { composer, bloomPass, gradePass, renderPass };
}

// ── Electrical arcs ──

const ARC_COUNT = 6;
const ARC_SEGMENTS = 20;

export class ElectricalArcs {
  constructor() {
    this.group = new THREE.Group();
    this.arcs = [];
    this.time = 0;

    for (let i = 0; i < ARC_COUNT; i++) {
      const points = [];
      for (let j = 0; j <= ARC_SEGMENTS; j++) {
        points.push(new THREE.Vector3(0, 0, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(0.3, 0.7, 1.0),
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        linewidth: 1,
      });
      const line = new THREE.Line(geo, mat);
      this.arcs.push({ line, geo, mat });
      this.group.add(line);
    }
  }

  update(dt, intensity) {
    this.time += dt;

    for (let a = 0; a < this.arcs.length; a++) {
      const arc = this.arcs[a];
      const positions = arc.geo.attributes.position;

      // Random direction for this arc
      const baseAngle = (a / ARC_COUNT) * Math.PI * 2 + this.time * 0.5;
      const basePhi = Math.sin(this.time * 1.5 + a) * 0.5 + 0.5;

      for (let j = 0; j <= ARC_SEGMENTS; j++) {
        const t = j / ARC_SEGMENTS;
        const radius = t * 0.18;

        // Direction
        const dx = Math.cos(baseAngle) * Math.sin(basePhi * Math.PI);
        const dy = Math.cos(basePhi * Math.PI);
        const dz = Math.sin(baseAngle) * Math.sin(basePhi * Math.PI);

        // Lightning jitter
        const jitter = (1 - t) * 0.03 * intensity;
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;
        const jz = (Math.random() - 0.5) * jitter;

        positions.array[j * 3] = dx * radius + jx;
        positions.array[j * 3 + 1] = dy * radius + jy;
        positions.array[j * 3 + 2] = dz * radius + jz;
      }
      positions.needsUpdate = true;

      // Flicker visibility
      const flicker = Math.random();
      arc.mat.opacity = flicker > 0.4 ? intensity * 0.6 : 0;
    }
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  dispose() {
    for (const arc of this.arcs) {
      arc.geo.dispose();
      arc.mat.dispose();
    }
  }
}

// ── Energy Shockwave Ring ──

const shockwaveVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shockwaveFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uProgress;
  uniform vec3 uColor;

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float dist = length(uv);

    // Expanding thin ring
    float ringRadius = uProgress;
    float thickness = 0.08 * (1.0 - uProgress * 0.5);
    float ring = smoothstep(ringRadius - thickness, ringRadius, dist) *
                 smoothstep(ringRadius + thickness, ringRadius, dist);

    float alpha = ring * (1.0 - uProgress) * 0.9;
    vec3 col = uColor * 2.5;

    gl_FragColor = vec4(col, alpha);
  }
`;

export class ShockwaveRing {
  constructor() {
    this.group = new THREE.Group();
    this.progress = 1.0;
    this.duration = 0.6;
    this.timer = 0;
    this.active = false;

    const geo = new THREE.PlaneGeometry(1.6, 1.6);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: shockwaveVert,
      fragmentShader: shockwaveFrag,
      uniforms: {
        uProgress: { value: 1.0 },
        uColor: { value: new THREE.Color(0.2, 0.7, 1.0) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  trigger(x, y, z, scale = 1.0) {
    this.group.position.set(x, y, z);
    this.mesh.scale.setScalar(scale);
    this.progress = 0;
    this.timer = 0;
    this.active = true;
    this.group.visible = true;
    this.mat.uniforms.uProgress.value = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    this.progress = Math.min(this.timer / this.duration, 1.0);
    this.mat.uniforms.uProgress.value = this.progress;

    if (this.progress >= 1.0) {
      this.active = false;
      this.group.visible = false;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
