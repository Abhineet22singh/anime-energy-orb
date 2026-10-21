/**
 * smoke.js – Volumetric smoke particles around the orb
 */

import * as THREE from 'three';

const MAX_SMOKE = 200;

// ── Smoke vertex shader ──
const smokeVert = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aRotation;
  attribute float aBirth;
  attribute vec3 aVelocity;
  uniform float uTime;
  uniform float uIntensity;
  varying float vLife;
  varying float vRotation;
  varying float vAlpha;

  void main() {
    float age = uTime - aBirth;
    float maxLife = aLife;
    float t = clamp(age / maxLife, 0.0, 1.0);

    if (t >= 1.0) {
      // Dead particle – hide it
      gl_PointSize = 0.0;
      gl_Position = vec4(99999.0);
      vAlpha = 0.0;
      return;
    }

    vLife = t;
    vRotation = aRotation + uTime * 0.5;

    // Expand outward + drift upward
    vec3 pos = position + aVelocity * age + vec3(0.0, age * 0.04, 0.0);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // Grow then shrink
    float sizeCurve = sin(t * 3.14159) * 0.8 + 0.2;
    float size = aSize * sizeCurve * uIntensity * (250.0 / max(-mvPos.z, 1.0));
    gl_PointSize = size;

    // Fade in quickly, fade out slowly
    vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.4, t) * uIntensity * 0.4;

    gl_Position = projectionMatrix * mvPos;
  }
`;

const smokeFrag = /* glsl */ `
  varying float vLife;
  varying float vRotation;
  varying float vAlpha;
  uniform vec3 uColor;

  void main() {
    // Rotate UV
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRotation);
    float s = sin(vRotation);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
    uv += 0.5;

    float d = length(uv - 0.5) * 2.0;
    if (d > 1.0) discard;

    // Soft circle with wispy edges
    float alpha = smoothstep(1.0, 0.4, d) * vAlpha;

    // Add some interior variation
    float noise = sin(uv.x * 20.0 + vLife * 10.0) * sin(uv.y * 20.0 - vLife * 8.0);
    noise = noise * 0.15 + 0.85;

    vec3 col = uColor * noise;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class OrbSmoke {
  constructor() {
    this.group = new THREE.Group();
    this.time = 0;
    this.emitTimer = 0;
    this.nextIndex = 0;
    this.active = false;

    this._createParticles();
  }

  _createParticles() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_SMOKE * 3);
    const sizes = new Float32Array(MAX_SMOKE);
    const lives = new Float32Array(MAX_SMOKE);
    const rotations = new Float32Array(MAX_SMOKE);
    const births = new Float32Array(MAX_SMOKE);
    const velocities = new Float32Array(MAX_SMOKE * 3);

    // Initialise all particles as dead (birth far in the past)
    for (let i = 0; i < MAX_SMOKE; i++) {
      births[i] = -1000;
      lives[i] = 1;
      sizes[i] = 1;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(births, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      vertexShader: smokeVert,
      fragmentShader: smokeFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color(0.1, 0.3, 0.6) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.group.add(this.points);
  }

  /**
   * Emit a smoke particle.
   */
  _emit(speed, charge) {
    const i = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % MAX_SMOKE;

    const pos = this.geometry.attributes.position;
    const sizes = this.geometry.attributes.aSize;
    const lives = this.geometry.attributes.aLife;
    const rotations = this.geometry.attributes.aRotation;
    const births = this.geometry.attributes.aBirth;
    const vels = this.geometry.attributes.aVelocity;

    // Random position near origin
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = 0.05 + Math.random() * 0.08;
    pos.array[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    pos.array[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
    pos.array[i * 3 + 2] = Math.cos(phi) * r;

    sizes.array[i] = (Math.random() * 12 + 6) * (1 + charge * 0.5);
    lives.array[i] = Math.random() * 1.5 + 0.8;
    rotations.array[i] = Math.random() * Math.PI * 2;
    births.array[i] = this.time;

    // Velocity: outward + turbulence
    const vSpeed = (0.02 + Math.random() * 0.04) * (1 + speed * 0.5 + charge * 0.3);
    vels.array[i * 3] = (Math.random() - 0.5) * vSpeed * 2;
    vels.array[i * 3 + 1] = Math.random() * vSpeed;
    vels.array[i * 3 + 2] = (Math.random() - 0.5) * vSpeed * 2;

    pos.needsUpdate = true;
    sizes.needsUpdate = true;
    lives.needsUpdate = true;
    rotations.needsUpdate = true;
    births.needsUpdate = true;
    vels.needsUpdate = true;
  }

  /**
   * Update each frame.
   * @param {number} dt – delta time in seconds
   * @param {number} intensity – overall intensity (0 when hidden)
   * @param {number} densityScale – density multiplier from UI
   * @param {number} handSpeed – how fast the hand is moving
   * @param {number} charge – charge level 0-1
   */
  update(dt, intensity, densityScale, handSpeed, charge) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uIntensity.value = intensity * densityScale;

    // Emit rate based on intensity and hand speed
    if (intensity > 0.05) {
      const rate = (8 + handSpeed * 20 + charge * 15) * densityScale;
      this.emitTimer += dt * rate;
      while (this.emitTimer >= 1) {
        this._emit(handSpeed, charge);
        this.emitTimer -= 1;
      }
    }
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
