/**
 * particles.js – GPU-friendly floating particles and sparks
 */

import * as THREE from 'three';

const PARTICLE_COUNT = 300;
const SPARK_COUNT = 80;

// ── Particle vertex shader ──
const particleVert = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aSpeed;
  attribute vec3 aOffset;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uScale;
  varying float vLife;
  varying float vDist;

  void main() {
    vLife = aLife;

    // Orbit around origin
    float angle = uTime * aSpeed + aLife * 6.283;
    float radius = 0.15 + aOffset.x * 0.2;
    vec3 pos = vec3(
      cos(angle) * radius + aOffset.y * 0.05,
      sin(angle * 0.7 + aLife * 3.14) * radius * 0.6 + aOffset.z * 0.05,
      sin(angle) * radius + aOffset.x * 0.03
    );

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vDist = -mvPos.z;

    float size = aSize * uScale * uIntensity * (200.0 / max(-mvPos.z, 1.0));
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const particleFrag = /* glsl */ `
  varying float vLife;
  varying float vDist;
  uniform float uIntensity;
  uniform vec3 uColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    float alpha = smoothstep(1.0, 0.3, d) * uIntensity;
    float glow = exp(-d * 3.0) * 0.8;
    vec3 col = uColor + vec3(0.4, 0.6, 1.0) * glow;

    // Twinkle
    float twinkle = sin(vLife * 50.0 + vDist * 10.0) * 0.3 + 0.7;
    alpha *= twinkle;

    gl_FragColor = vec4(col * uIntensity, alpha * 0.8);
  }
`;

// ── Spark vertex shader ──
const sparkVert = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aDir;
  uniform float uTime;
  uniform float uIntensity;
  varying float vAlpha;

  void main() {
    float t = mod(uTime * aSpeed + aPhase, 1.0);
    vec3 pos = aDir * t * 0.3;
    vAlpha = (1.0 - t) * uIntensity;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (1.0 - t) * uIntensity * (150.0 / max(-mvPos.z, 1.0));
    gl_Position = projectionMatrix * mvPos;
  }
`;

const sparkFrag = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = exp(-d * 4.0);
    vec3 col = uColor * glow * 2.0;
    gl_FragColor = vec4(col, glow * vAlpha);
  }
`;

export class OrbParticles {
  constructor() {
    this.group = new THREE.Group();
    this._createFloating();
    this._createSparks();
  }

  _createFloating() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const lives = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const offsets = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      sizes[i] = Math.random() * 3 + 1;
      lives[i] = Math.random();
      speeds[i] = Math.random() * 1.5 + 0.5;
      offsets[i * 3] = (Math.random() - 0.5) * 2;
      offsets[i * 3 + 1] = (Math.random() - 0.5) * 2;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));

    this.floatingMat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uScale: { value: 1 },
        uColor: { value: new THREE.Color(0.2, 0.5, 1.0) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.floatingPoints = new THREE.Points(geo, this.floatingMat);
    this.group.add(this.floatingPoints);
  }

  _createSparks() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SPARK_COUNT * 3);
    const sizes = new Float32Array(SPARK_COUNT);
    const phases = new Float32Array(SPARK_COUNT);
    const speeds = new Float32Array(SPARK_COUNT);
    const dirs = new Float32Array(SPARK_COUNT * 3);

    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      sizes[i] = Math.random() * 4 + 2;
      phases[i] = Math.random();
      speeds[i] = Math.random() * 2 + 1;

      // Random direction on unit sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      dirs[i * 3] = Math.sin(phi) * Math.cos(theta);
      dirs[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
      dirs[i * 3 + 2] = Math.cos(phi);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));

    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: sparkVert,
      fragmentShader: sparkFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color(0.5, 0.8, 1.0) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.sparkPoints = new THREE.Points(geo, this.sparkMat);
    this.group.add(this.sparkPoints);
  }

  update(dt, time, intensity, densityScale) {
    const effectiveIntensity = intensity * densityScale;
    this.floatingMat.uniforms.uTime.value = time;
    this.floatingMat.uniforms.uIntensity.value = effectiveIntensity;
    this.floatingMat.uniforms.uScale.value = densityScale;

    this.sparkMat.uniforms.uTime.value = time;
    this.sparkMat.uniforms.uIntensity.value = effectiveIntensity;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material && child.material.dispose) child.material.dispose();
    });
  }
}
