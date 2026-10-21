/**
 * orangeFilaments.js – Organic orange/amber energy filaments wrapping around fingers & palm
 *
 * Implements Catmull-Rom splines derived from hand landmarks with animated
 * spiral offsets, bright white-orange cores, soft golden glow, subtle flickering,
 * knuckle webbing arches, and escaping amber sparks.
 */

import * as THREE from 'three';

// Landmark indices for each finger (from wrist 0 to tip)
const FINGER_CHAINS = [
  [0, 1, 2, 3, 4],       // Thumb
  [0, 5, 6, 7, 8],       // Index
  [0, 9, 10, 11, 12],    // Middle
  [0, 13, 14, 15, 16],   // Ring
  [0, 17, 18, 19, 20],   // Pinky
];

// Webbing arches between adjacent knuckle bases
const WEBBING_PAIRS = [
  [2, 5],   // Thumb to Index base
  [5, 9],   // Index to Middle base
  [9, 13],  // Middle to Ring base
  [13, 17], // Ring to Pinky base
];

// Palm perimeter loop
const PALM_LOOP = [0, 1, 2, 5, 9, 13, 17, 0];

const POINTS_PER_FINGER = 24;
const STRANDS_PER_FINGER = 2; // Two entwining strands per finger
const SPARK_COUNT = 60;

export class OrangeFilaments {
  constructor() {
    this.group = new THREE.Group();
    this.time = 0;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.visible = false;

    this._createStrands();
    this._createWebbing();
    this._createSparks();
  }

  _createStrands() {
    this.strands = [];

    // For each finger chain, create multiple animated strands (core + aura)
    for (let f = 0; f < FINGER_CHAINS.length; f++) {
      for (let s = 0; s < STRANDS_PER_FINGER; s++) {
        // 1. Bright white-orange Core line
        const coreGeo = new THREE.BufferGeometry();
        const corePositions = new Float32Array(POINTS_PER_FINGER * 3);
        const coreColors = new Float32Array(POINTS_PER_FINGER * 3);

        for (let i = 0; i < POINTS_PER_FINGER; i++) {
          const t = i / (POINTS_PER_FINGER - 1);
          // Root is deep amber, mid is bright hot orange/white, tip is intense orange
          const r = 1.0;
          const g = THREE.MathUtils.lerp(0.38, 0.92, Math.sin(t * Math.PI));
          const b = THREE.MathUtils.lerp(0.06, 0.48, Math.sin(t * Math.PI));
          coreColors[i * 3] = r;
          coreColors[i * 3 + 1] = g;
          coreColors[i * 3 + 2] = b;
        }

        coreGeo.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
        coreGeo.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));

        const coreMat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          linewidth: 2,
        });

        const coreLine = new THREE.Line(coreGeo, coreMat);
        this.group.add(coreLine);

        // 2. Soft golden/amber outer glow line
        const auraGeo = new THREE.BufferGeometry();
        const auraPositions = new Float32Array(POINTS_PER_FINGER * 3);
        auraGeo.setAttribute('position', new THREE.BufferAttribute(auraPositions, 3));

        const auraMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(1.0, 0.48, 0.06),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          linewidth: 4,
        });

        const auraLine = new THREE.Line(auraGeo, auraMat);
        this.group.add(auraLine);

        this.strands.push({
          fingerIndex: f,
          strandIndex: s,
          coreLine,
          coreGeo,
          coreMat,
          auraLine,
          auraGeo,
          auraMat,
          phase: s * Math.PI + f * 0.8,
          speed: 4.2 + f * 0.5,
          radius: 0.009 + s * 0.006, // Tightly hugs the finger skin
        });
      }
    }

    // Palm energy loop strands
    this.palmStrands = [];
    for (let p = 0; p < 2; p++) {
      const pGeo = new THREE.BufferGeometry();
      const pPositions = new Float32Array(32 * 3);
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

      const pMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(1.0, 0.55, 0.1),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });

      const pLine = new THREE.Line(pGeo, pMat);
      this.group.add(pLine);
      this.palmStrands.push({ line: pLine, geo: pGeo, mat: pMat, phase: p * Math.PI });
    }
  }

  _createWebbing() {
    this.webbingStrands = [];
    for (let w = 0; w < WEBBING_PAIRS.length; w++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(16 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(1.0, 0.6, 0.12),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geo, mat);
      this.group.add(line);
      this.webbingStrands.push({
        line,
        geo,
        mat,
        pair: WEBBING_PAIRS[w],
        phase: w * 1.2,
      });
    }
  }

  _createSparks() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SPARK_COUNT * 3);
    const colors = new Float32Array(SPARK_COUNT * 3);
    const sizes = new Float32Array(SPARK_COUNT);
    const lives = new Float32Array(SPARK_COUNT);
    const vels = new Float32Array(SPARK_COUNT * 3);

    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // Golden amber to bright yellow-white
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.45;
      colors[i * 3 + 2] = 0.1 + Math.random() * 0.3;

      sizes[i] = Math.random() * 4 + 2;
      lives[i] = Math.random();

      vels[i * 3] = (Math.random() - 0.5) * 0.05;
      vels[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      vels[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const sparkShader = {
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uIntensity;

        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uIntensity * (180.0 / max(-mvPos.z, 0.5));
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        uniform float uIntensity;

        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float glow = exp(-d * 3.5);
          gl_FragColor = vec4(vColor * 1.5, glow * uIntensity * 0.9);
        }
      `,
    };

    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: sparkShader.vertexShader,
      fragmentShader: sparkShader.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.sparks = new THREE.Points(geo, this.sparkMat);
    this.sparkData = { geo, lives, vels, positions };
    this.group.add(this.sparks);
  }

  show() {
    this.visible = true;
    this.targetIntensity = 1.0;
  }

  hide() {
    this.visible = false;
    this.targetIntensity = 0.0;
  }

  update(dt, landmarks, projectFn, scaleMultiplier = 1.0) {
    this.time += dt;

    const lerpRate = 1 - Math.pow(0.001, dt);
    this.intensity += (this.targetIntensity - this.intensity) * lerpRate;

    if (this.intensity < 0.01 || !landmarks) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Flicker factor: subtle electrical vibration (0.88 to 1.12)
    const flicker = 0.88 + 0.12 * Math.sin(this.time * 28.0) * Math.cos(this.time * 19.0);
    const currentAlpha = Math.min(this.intensity * flicker, 1.0);

    // 1. Build Catmull-Rom spline curves for all 5 fingers
    const fingerSplines = [];
    for (let f = 0; f < FINGER_CHAINS.length; f++) {
      const chain = FINGER_CHAINS[f];
      const pts = chain.map((idx) => {
        const p = projectFn(landmarks[idx]);
        return new THREE.Vector3(p.x, p.y, p.z);
      });
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      fingerSplines.push(curve);
    }

    // 2. Update finger strands wrapping organically around fingers
    for (let i = 0; i < this.strands.length; i++) {
      const strand = this.strands[i];
      const curve = fingerSplines[strand.fingerIndex];
      const corePos = strand.coreGeo.attributes.position;
      const auraPos = strand.auraGeo.attributes.position;

      strand.coreMat.opacity = currentAlpha * 0.95;
      strand.auraMat.opacity = currentAlpha * 0.45;

      const baseRadius = strand.radius * scaleMultiplier;

      for (let j = 0; j < POINTS_PER_FINGER; j++) {
        const u = j / (POINTS_PER_FINGER - 1);
        const pt = curve.getPoint(u);
        const tangent = curve.getTangent(u);

        const up = new THREE.Vector3(0, 1, 0);
        let normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        if (normal.lengthSq() < 0.01) normal = new THREE.Vector3(1, 0, 0);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        const angle = u * Math.PI * 4.0 + this.time * strand.speed + strand.phase;
        const knuckleBulge = 1.0 + 0.35 * Math.sin(u * Math.PI * 3.0);
        const r = baseRadius * knuckleBulge * Math.sin(u * Math.PI * 0.95);

        const jitterX = Math.sin(u * 20.0 + this.time * 15.0) * 0.0015 * scaleMultiplier;
        const jitterY = Math.cos(u * 20.0 - this.time * 12.0) * 0.0015 * scaleMultiplier;

        const offsetX = normal.x * Math.cos(angle) * r + binormal.x * Math.sin(angle) * r + jitterX;
        const offsetY = normal.y * Math.cos(angle) * r + binormal.y * Math.sin(angle) * r + jitterY;
        const offsetZ = normal.z * Math.cos(angle) * r + binormal.z * Math.sin(angle) * r;

        corePos.array[j * 3] = pt.x + offsetX;
        corePos.array[j * 3 + 1] = pt.y + offsetY;
        corePos.array[j * 3 + 2] = pt.z + offsetZ;

        auraPos.array[j * 3] = pt.x + offsetX * 1.35;
        auraPos.array[j * 3 + 1] = pt.y + offsetY * 1.35;
        auraPos.array[j * 3 + 2] = pt.z + offsetZ * 1.35;
      }

      corePos.needsUpdate = true;
      auraPos.needsUpdate = true;
    }

    // 3. Update knuckle webbing arches between adjacent fingers
    for (let w = 0; w < this.webbingStrands.length; w++) {
      const strand = this.webbingStrands[w];
      const [idxA, idxB] = strand.pair;
      const ptA = projectFn(landmarks[idxA]);
      const ptB = projectFn(landmarks[idxB]);
      const pos = strand.geo.attributes.position;
      strand.mat.opacity = currentAlpha * 0.65;

      for (let j = 0; j < 16; j++) {
        const u = j / 15;
        const x = THREE.MathUtils.lerp(ptA.x, ptB.x, u);
        const y = THREE.MathUtils.lerp(ptA.y, ptB.y, u);
        const z = THREE.MathUtils.lerp(ptA.z, ptB.z, u);

        // Arch upward between knuckles
        const arch = Math.sin(u * Math.PI) * 0.008 * scaleMultiplier;
        const wave = Math.sin(u * Math.PI * 4.0 + this.time * 6.0 + strand.phase) * 0.003 * scaleMultiplier;

        pos.array[j * 3] = x;
        pos.array[j * 3 + 1] = y + arch + wave;
        pos.array[j * 3 + 2] = z + wave;
      }
      pos.needsUpdate = true;
    }

    // 4. Update palm contour strands
    const palmPts = PALM_LOOP.map((idx) => {
      const p = projectFn(landmarks[idx]);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const palmCurve = new THREE.CatmullRomCurve3(palmPts, true, 'centripetal', 0.5);

    for (let p = 0; p < this.palmStrands.length; p++) {
      const strand = this.palmStrands[p];
      const pos = strand.geo.attributes.position;
      strand.mat.opacity = currentAlpha * 0.55;

      for (let j = 0; j < 32; j++) {
        const u = j / 31;
        const pt = palmCurve.getPoint(u);
        const wave = Math.sin(u * Math.PI * 6.0 + this.time * 5.0 + strand.phase) * 0.004 * scaleMultiplier;
        pos.array[j * 3] = pt.x + wave;
        pos.array[j * 3 + 1] = pt.y + wave;
        pos.array[j * 3 + 2] = pt.z + wave;
      }
      pos.needsUpdate = true;
    }

    // 5. Update Amber Sparks floating around fingers
    this._updateSparks(dt, fingerSplines, currentAlpha, scaleMultiplier);
  }

  _updateSparks(dt, splines, alpha, scaleMultiplier) {
    const { geo, lives, vels, positions } = this.sparkData;
    this.sparkMat.uniforms.uTime.value = this.time;
    this.sparkMat.uniforms.uIntensity.value = alpha;

    for (let i = 0; i < SPARK_COUNT; i++) {
      lives[i] += dt * 1.5;

      if (lives[i] >= 1.0) {
        lives[i] = 0;
        const splineIdx = Math.floor(Math.random() * splines.length);
        const spline = splines[splineIdx];
        const u = 0.2 + Math.random() * 0.75;
        const pt = spline.getPoint(u);

        positions[i * 3] = pt.x + (Math.random() - 0.5) * 0.012 * scaleMultiplier;
        positions[i * 3 + 1] = pt.y + (Math.random() - 0.5) * 0.012 * scaleMultiplier;
        positions[i * 3 + 2] = pt.z + (Math.random() - 0.5) * 0.012 * scaleMultiplier;

        vels[i * 3] = (Math.random() - 0.5) * 0.035 * scaleMultiplier;
        vels[i * 3 + 1] = (0.02 + Math.random() * 0.045) * scaleMultiplier;
        vels[i * 3 + 2] = (Math.random() - 0.5) * 0.035 * scaleMultiplier;
      } else {
        positions[i * 3] += vels[i * 3] * dt;
        positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vels[i * 3 + 2] * dt;
      }
    }

    geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    for (const strand of this.strands) {
      strand.coreGeo.dispose();
      strand.coreMat.dispose();
      strand.auraGeo.dispose();
      strand.auraMat.dispose();
    }
    for (const w of this.webbingStrands) {
      w.geo.dispose();
      w.mat.dispose();
    }
    for (const p of this.palmStrands) {
      p.geo.dispose();
      p.mat.dispose();
    }
    this.sparkData.geo.dispose();
    this.sparkMat.dispose();
  }
}
