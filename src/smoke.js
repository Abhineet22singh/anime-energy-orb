/**
 * smoke.js – Organic curling anime smoke & expanding energy waves
 *
 * Implements:
 * 1. Wispy, semi-transparent blue-white smoke curling around orb and hand
 * 2. Large expanding energy waves that drift across the scene with delicate transparency
 * 3. Face-aware trajectory and eye-clarity masking so the user's face and eyes remain recognizable
 * 4. Motion trails responding to hand speed and velocity
 * 5. Procedural GPU noise distortion for organic, irregular non-circular shapes
 */

import * as THREE from 'three';

const LOCAL_SMOKE_COUNT = 160;
const EXPANDING_WAVE_COUNT = 80;

// ── Organic Smoke Vertex Shader ──
const smokeVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aRotation;
  attribute float aBirth;
  attribute vec3 aVelocity;
  attribute float aType; // 0 = local curling wisp, 1 = expanding scene wave
  uniform float uTime;
  uniform float uIntensity;
  varying float vLife;
  varying float vRotation;
  varying float vAlpha;
  varying float vType;
  varying vec3 vWorldPos;

  void main() {
    float age = uTime - aBirth;
    float maxLife = aLife;
    float t = clamp(age / maxLife, 0.0, 1.0);

    vType = aType;
    vLife = t;

    if (t >= 1.0 || uIntensity <= 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(99999.0);
      vAlpha = 0.0;
      return;
    }

    // Dynamic rotation with slight acceleration
    vRotation = aRotation + age * (aType > 0.5 ? 0.15 : 0.45);

    // Position trajectory: velocity + upward thermal convection + subtle curl turbulence
    vec3 curl = vec3(
      sin(age * 3.5 + aRotation) * 0.025,
      age * (aType > 0.5 ? 0.09 : 0.15),
      cos(age * 3.5 + aRotation) * 0.025
    );

    vec3 pos = position + aVelocity * age + curl;
    vWorldPos = pos;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // Particle scale evolution (starts compact, expands into airy wisps)
    float expansion = aType > 0.5 ? (1.0 + t * 4.5) : (0.4 + sin(t * 3.14159) * 0.9);
    float size = aSize * expansion * uIntensity * (280.0 / max(-mvPos.z, 0.5));
    gl_PointSize = size;

    // Organic fade envelope (fast rise, gentle long dissipation)
    float fadeIn = smoothstep(0.0, 0.18, t);
    float fadeOut = smoothstep(1.0, 0.45, t);
    float baseOpacity = aType > 0.5 ? 0.16 : 0.42; // Expanding waves are delicate & translucent
    vAlpha = fadeIn * fadeOut * uIntensity * baseOpacity;

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ── Organic Smoke Fragment Shader with Face & Eye Clarity Masking ──
const smokeFragmentShader = /* glsl */ `
  varying float vLife;
  varying float vRotation;
  varying float vAlpha;
  varying float vType;
  varying vec3 vWorldPos;
  uniform vec3 uColorWisp;
  uniform vec3 uColorWave;
  uniform vec3 uEyeLeft;
  uniform vec3 uEyeRight;
  uniform float uHasFace;

  void main() {
    if (vAlpha <= 0.005) discard;

    // Rotated UV coordinates
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRotation);
    float s = sin(vRotation);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

    float dist = length(uv) * 2.0;
    if (dist > 1.0) discard;

    // Multi-octave procedural tendril distortion (irregular, airy anime smoke)
    float angle = atan(uv.y, uv.x);
    float tendril1 = sin(angle * 3.0 + dist * 5.0 + vLife * 4.0) * 0.18;
    float tendril2 = sin(angle * 7.0 - dist * 8.0) * 0.12;
    float distortedDist = dist + tendril1 + tendril2;

    // Soft organic falloff
    float shape = smoothstep(1.0, 0.25, distortedDist);

    // Internal density variations (cloud wisps)
    float internalNoise = sin(uv.x * 14.0 + vLife * 6.0) * cos(uv.y * 14.0 - vLife * 5.0);
    shape *= 0.75 + internalNoise * 0.25;

    // Eye Clarity Protection: Softly attenuate smoke right over the user's eyes so gaze stays clear
    float alphaMod = vAlpha;
    if (uHasFace > 0.5) {
      float dLeft = length(vWorldPos.xy - uEyeLeft.xy);
      float dRight = length(vWorldPos.xy - uEyeRight.xy);
      float eyeMask = min(smoothstep(0.04, 0.12, dLeft), smoothstep(0.04, 0.12, dRight));
      alphaMod *= mix(0.25, 1.0, eyeMask);
    }

    // Color gradient: pale luminous cyan-white core fading to translucent azure
    vec3 baseCol = vType > 0.5 ? uColorWave : uColorWisp;
    vec3 col = mix(baseCol, vec3(0.9, 0.98, 1.0), shape * 0.65);

    gl_FragColor = vec4(col, shape * alphaMod);
  }
`;

export class OrbSmoke {
  constructor() {
    this.group = new THREE.Group();
    this.time = 0;
    this.localEmitTimer = 0;
    this.waveEmitTimer = 0;
    this.nextIndex = 0;
    this.totalParticles = LOCAL_SMOKE_COUNT + EXPANDING_WAVE_COUNT;

    this._createParticleSystem();
  }

  _createParticleSystem() {
    const N = this.totalParticles;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const lives = new Float32Array(N);
    const rotations = new Float32Array(N);
    const births = new Float32Array(N);
    const velocities = new Float32Array(N * 3);
    const types = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      births[i] = -9999;
      lives[i] = 1.0;
      sizes[i] = 1.0;
      types[i] = i >= LOCAL_SMOKE_COUNT ? 1.0 : 0.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(births, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aType', new THREE.BufferAttribute(types, 1));

    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      vertexShader: smokeVertexShader,
      fragmentShader: smokeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColorWisp: { value: new THREE.Color(0.28, 0.74, 1.0) }, // Pale blue-white wisp
        uColorWave: { value: new THREE.Color(0.18, 0.58, 0.96) }, // Translucent scene wave
        uEyeLeft: { value: new THREE.Vector3(0, 0, 0) },
        uEyeRight: { value: new THREE.Vector3(0, 0, 0) },
        uHasFace: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.group.add(this.points);
  }

  _emit(type, orbPos, handVel, charge, scaleMultiplier, facePos) {
    let index;
    if (type === 0) {
      // Local curling wisp (indices 0 .. LOCAL_SMOKE_COUNT-1)
      this.localIndex = ((this.localIndex || 0) + 1) % LOCAL_SMOKE_COUNT;
      index = this.localIndex;
    } else {
      // Expanding scene wave (indices LOCAL_SMOKE_COUNT .. N-1)
      this.waveIndex = ((this.waveIndex || 0) + 1) % EXPANDING_WAVE_COUNT;
      index = LOCAL_SMOKE_COUNT + this.waveIndex;
    }

    const pos = this.geometry.attributes.position;
    const sizes = this.geometry.attributes.aSize;
    const lives = this.geometry.attributes.aLife;
    const rots = this.geometry.attributes.aRotation;
    const births = this.geometry.attributes.aBirth;
    const vels = this.geometry.attributes.aVelocity;

    // Origin around orb
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = (type === 0 ? 0.04 + Math.random() * 0.05 : 0.07 + Math.random() * 0.07) * scaleMultiplier;

    pos.array[index * 3] = orbPos.x + Math.sin(phi) * Math.cos(theta) * r;
    pos.array[index * 3 + 1] = orbPos.y + Math.sin(phi) * Math.sin(theta) * r;
    pos.array[index * 3 + 2] = orbPos.z + Math.cos(phi) * r;

    // Life duration
    lives.array[index] = type === 0 ? (1.2 + Math.random() * 0.8) : (2.4 + Math.random() * 1.4);
    rots.array[index] = Math.random() * Math.PI * 2;
    births.array[index] = this.time;

    // Scale
    if (type === 0) {
      sizes.array[index] = (9.0 + Math.random() * 8.0) * scaleMultiplier;
    } else {
      sizes.array[index] = (22.0 + Math.random() * 18.0) * scaleMultiplier;
    }

    // Velocity
    const speedMag = (type === 0 ? 0.035 : 0.065) * (1.0 + charge * 0.5) * scaleMultiplier;
    const trailBiasX = -handVel.x * 0.35;
    const trailBiasY = -handVel.y * 0.35;

    // If face is tracked, a portion of the expanding energy waves drift across upper body toward face
    let driftToFaceX = 0;
    let driftToFaceY = 0;
    if (type === 1 && facePos) {
      const dx = facePos.x - orbPos.x;
      const dy = facePos.y - orbPos.y;
      const dist = Math.hypot(dx, dy) || 1;
      driftToFaceX = (dx / dist) * 0.035;
      driftToFaceY = (dy / dist) * 0.035;
    }

    vels.array[index * 3] = (Math.random() - 0.5) * speedMag * 2.0 + trailBiasX + driftToFaceX;
    vels.array[index * 3 + 1] = Math.random() * speedMag * 1.5 + 0.02 * scaleMultiplier + trailBiasY + driftToFaceY;
    vels.array[index * 3 + 2] = (Math.random() - 0.5) * speedMag * 2.0;

    pos.needsUpdate = true;
    sizes.needsUpdate = true;
    lives.needsUpdate = true;
    rots.needsUpdate = true;
    births.needsUpdate = true;
    vels.needsUpdate = true;
  }

  update(dt, orbPos, intensity, densityScale, handSpeed, handVel, charge, scaleMultiplier = 1.0, faceData = null) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uIntensity.value = intensity * densityScale;

    // Face data for eye clarity
    if (faceData && faceData.leftEye && faceData.rightEye) {
      this.material.uniforms.uEyeLeft.value.set(faceData.leftEye.x, faceData.leftEye.y, faceData.leftEye.z);
      this.material.uniforms.uEyeRight.value.set(faceData.rightEye.x, faceData.rightEye.y, faceData.rightEye.z);
      this.material.uniforms.uHasFace.value = 1.0;
    } else {
      this.material.uniforms.uHasFace.value = 0.0;
    }

    if (intensity > 0.02) {
      // 1. Emit local curling smoke wisps
      const localRate = (14.0 + handSpeed * 32.0 + charge * 20.0) * densityScale;
      this.localEmitTimer += dt * localRate;
      while (this.localEmitTimer >= 1.0) {
        this._emit(0, orbPos, handVel, charge, scaleMultiplier, faceData ? faceData.faceCenter : null);
        this.localEmitTimer -= 1.0;
      }

      // 2. Emit expanding scene waves
      const waveRate = (2.5 + charge * 4.0 + handSpeed * 6.0) * densityScale;
      this.waveEmitTimer += dt * waveRate;
      while (this.waveEmitTimer >= 1.0) {
        this._emit(1, orbPos, handVel, charge, scaleMultiplier, faceData ? faceData.faceCenter : null);
        this.waveEmitTimer -= 1.0;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
