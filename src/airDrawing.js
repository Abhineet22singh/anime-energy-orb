/**
 * airDrawing.js – Real-time index finger tracking trail & 3D air-drawing ribbon system
 *
 * Tracks the user's index finger in real time, rendering:
 * 1. Glowing orange energy trails & particle sparks following finger movement
 * 2. 3D Air-Drawing Mode: allows drawing persistent glowing shapes/symbols in the air
 */

import * as THREE from 'three';

const MAX_TRAIL_POINTS = 160;
const MAX_DRAW_POINTS = 800;
const SPARK_COUNT = 50;

export class AirDrawing {
  constructor() {
    this.group = new THREE.Group();
    this.time = 0;
    this.isDrawingMode = true; // Drawing active
    this.trailPoints = [];
    this.drawingStrokes = []; // Array of persistent stroke arrays
    this.currentStroke = null;

    this._createDynamicTrail();
    this._createPersistentStrokesMesh();
    this._createFingertipSparks();
  }

  _createDynamicTrail() {
    // Dynamic decaying ribbon trailing behind the index finger
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const colors = new Float32Array(MAX_TRAIL_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      linewidth: 3,
    });

    this.trailLine = new THREE.Line(geo, mat);
    this.group.add(this.trailLine);
  }

  _createPersistentStrokesMesh() {
    // Buffer for persistent air-drawn shapes
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_DRAW_POINTS * 3);
    const colors = new Float32Array(MAX_DRAW_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      linewidth: 3,
    });

    this.drawLines = new THREE.LineSegments(geo, mat);
    this.group.add(this.drawLines);
    this.drawData = { geo, positions, colors, ptr: 0 };
  }

  _createFingertipSparks() {
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
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.6 + Math.random() * 0.35;
      colors[i * 3 + 2] = 0.1;
      sizes[i] = Math.random() * 5 + 2;
      lives[i] = Math.random();
      vels[i * 3] = (Math.random() - 0.5) * 0.04;
      vels[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
      vels[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
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
        uniform float uIntensity;

        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uIntensity * (160.0 / max(-mvPos.z, 0.4));
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
          gl_FragColor = vec4(vColor * 1.6, glow * uIntensity * 0.9);
        }
      `,
    };

    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: sparkShader.vertexShader,
      fragmentShader: sparkShader.fragmentShader,
      uniforms: {
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.sparks = new THREE.Points(geo, this.sparkMat);
    this.sparkData = { geo, positions, colors, lives, vels };
    this.group.add(this.sparks);
  }

  /**
   * Clear all air drawings
   */
  clearDrawing() {
    this.drawingStrokes = [];
    this.currentStroke = null;
    const { geo, positions, colors } = this.drawData;
    positions.fill(0);
    colors.fill(0);
    this.drawData.ptr = 0;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  setDrawingMode(enabled) {
    this.isDrawingMode = enabled;
    if (!enabled) {
      this.currentStroke = null;
    }
  }

  /**
   * Update fingertip tracking each frame
   * @param {number} dt – Delta time
   * @param {object} indexTip3D – 3D position of landmark 8
   * @param {boolean} isHandPresent – Whether hand is detected
   * @param {number} intensity – Effect intensity
   */
  update(dt, indexTip3D, isHandPresent, intensity = 1.0) {
    this.time += dt;

    if (!isHandPresent || !indexTip3D) {
      this.trailPoints = [];
      this.currentStroke = null;
      this.trailLine.visible = false;
      this.sparks.visible = false;
      return;
    }

    this.trailLine.visible = true;
    this.sparks.visible = true;

    // 1. Update Dynamic Motion Trail (decaying ribbon behind index finger)
    this.trailPoints.unshift({
      x: indexTip3D.x,
      y: indexTip3D.y,
      z: indexTip3D.z,
      age: 0,
    });

    if (this.trailPoints.length > MAX_TRAIL_POINTS) {
      this.trailPoints.pop();
    }

    const trailPos = this.trailLine.geometry.attributes.position;
    const trailCol = this.trailLine.geometry.attributes.color;

    for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
      if (i < this.trailPoints.length) {
        const pt = this.trailPoints[i];
        pt.age += dt * 1.8;
        const alpha = Math.max(0, 1.0 - (i / MAX_TRAIL_POINTS) - pt.age);

        trailPos.array[i * 3] = pt.x;
        trailPos.array[i * 3 + 1] = pt.y;
        trailPos.array[i * 3 + 2] = pt.z;

        // Orange to gold gradient fade
        trailCol.array[i * 3] = 1.0 * alpha * intensity;
        trailCol.array[i * 3 + 1] = (0.55 + alpha * 0.35) * alpha * intensity;
        trailCol.array[i * 3 + 2] = 0.1 * alpha * intensity;
      } else {
        trailPos.array[i * 3] = indexTip3D.x;
        trailPos.array[i * 3 + 1] = indexTip3D.y;
        trailPos.array[i * 3 + 2] = indexTip3D.z;
        trailCol.array[i * 3] = 0;
        trailCol.array[i * 3 + 1] = 0;
        trailCol.array[i * 3 + 2] = 0;
      }
    }
    trailPos.needsUpdate = true;
    trailCol.needsUpdate = true;

    // 2. Air Drawing: Add persistent stroke segments
    if (this.isDrawingMode) {
      if (!this.currentStroke) {
        this.currentStroke = { lastPoint: { ...indexTip3D } };
      } else {
        const last = this.currentStroke.lastPoint;
        const d = Math.hypot(indexTip3D.x - last.x, indexTip3D.y - last.y, indexTip3D.z - last.z);

        // Add segment if moved a tiny bit
        if (d > 0.006 && this.drawData.ptr < MAX_DRAW_POINTS - 2) {
          const { geo, positions, colors } = this.drawData;
          const ptr = this.drawData.ptr;

          // Segment: last -> current
          positions[ptr * 3] = last.x;
          positions[ptr * 3 + 1] = last.y;
          positions[ptr * 3 + 2] = last.z;
          colors[ptr * 3] = 1.0;
          colors[ptr * 3 + 1] = 0.65;
          colors[ptr * 3 + 2] = 0.15;

          positions[(ptr + 1) * 3] = indexTip3D.x;
          positions[(ptr + 1) * 3 + 1] = indexTip3D.y;
          positions[(ptr + 1) * 3 + 2] = indexTip3D.z;
          colors[(ptr + 1) * 3] = 1.0;
          colors[(ptr + 1) * 3 + 1] = 0.75;
          colors[(ptr + 1) * 3 + 2] = 0.25;

          this.drawData.ptr += 2;
          this.currentStroke.lastPoint = { ...indexTip3D };

          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
      }
    }

    // 3. Fingertip Sparks Emitter
    const { geo, positions, lives, vels } = this.sparkData;
    this.sparkMat.uniforms.uIntensity.value = intensity;

    for (let i = 0; i < SPARK_COUNT; i++) {
      lives[i] += dt * 2.2;
      if (lives[i] >= 1.0) {
        lives[i] = 0;
        positions[i * 3] = indexTip3D.x + (Math.random() - 0.5) * 0.015;
        positions[i * 3 + 1] = indexTip3D.y + (Math.random() - 0.5) * 0.015;
        positions[i * 3 + 2] = indexTip3D.z + (Math.random() - 0.5) * 0.015;

        vels[i * 3] = (Math.random() - 0.5) * 0.035;
        vels[i * 3 + 1] = (0.01 + Math.random() * 0.035);
        vels[i * 3 + 2] = (Math.random() - 0.5) * 0.035;
      } else {
        positions[i * 3] += vels[i * 3] * dt;
        positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vels[i * 3 + 2] * dt;
      }
    }
    geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.trailLine.geometry.dispose();
    this.trailLine.material.dispose();
    this.drawLines.geometry.dispose();
    this.drawLines.material.dispose();
    this.sparkData.geo.dispose();
    this.sparkMat.dispose();
  }
}
