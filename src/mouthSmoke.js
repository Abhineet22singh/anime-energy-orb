/**
 * mouthSmoke.js – Mouth-triggered breath mist & exhaling smoke bursts
 *
 * Detects mouth opening & blowing from MediaPipe face landmarks in real-time,
 * generating organic cold blue-white ethereal mist billowing outward towards the camera.
 */

import * as THREE from 'three';

const MOUTH_PARTICLE_COUNT = 120;

const mouthSmokeVert = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aBirth;
  attribute float aRotation;
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

    vLife = t;

    if (t >= 1.0 || uIntensity <= 0.01) {
      gl_PointSize = 0.0;
      gl_Position = vec4(99999.0);
      vAlpha = 0.0;
      return;
    }

    vRotation = aRotation + age * 0.6;

    // Trajectory: billows forward towards camera + gentle upward thermal rise + turbulence
    vec3 curl = vec3(
      sin(age * 4.0 + aRotation) * 0.015,
      age * 0.06,
      cos(age * 4.0 + aRotation) * 0.015
    );

    vec3 pos = position + aVelocity * age + curl;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // Billow expansion: starts compact at lips, expands into delicate airy mist
    float expansion = 0.35 + sin(t * 3.14159) * 1.8 + t * 2.2;
    float size = aSize * expansion * uIntensity * (260.0 / max(-mvPos.z, 0.4));
    gl_PointSize = size;

    // Soft fade envelope
    float fadeIn = smoothstep(0.0, 0.12, t);
    float fadeOut = smoothstep(1.0, 0.4, t);
    vAlpha = fadeIn * fadeOut * uIntensity * 0.35; // Translucent so face remains visible

    gl_Position = projectionMatrix * mvPos;
  }
`;

const mouthSmokeFrag = /* glsl */ `
  varying float vLife;
  varying float vRotation;
  varying float vAlpha;
  uniform vec3 uColorMist;

  void main() {
    if (vAlpha <= 0.005) discard;

    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRotation);
    float s = sin(vRotation);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

    float dist = length(uv) * 2.0;
    if (dist > 1.0) discard;

    // Organic mist wisps
    float angle = atan(uv.y, uv.x);
    float tendril = sin(angle * 4.0 + dist * 6.0 + vLife * 5.0) * 0.15;
    float shape = smoothstep(1.0, 0.2, dist + tendril);

    // Color gradient: pale frosty cyan-white core fading to delicate azure
    vec3 col = mix(uColorMist, vec3(0.95, 0.99, 1.0), shape * 0.7);

    gl_FragColor = vec4(col, shape * vAlpha);
  }
`;

export class MouthSmoke {
  constructor() {
    this.group = new THREE.Group();
    this.time = 0;
    this.emitTimer = 0;
    this.nextIndex = 0;
    this.isMouthOpen = false;
    this.mouthOpenRatio = 0;
    this.prevMouthOpen = false;

    this._createParticleSystem();
  }

  _createParticleSystem() {
    const N = MOUTH_PARTICLE_COUNT;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const lives = new Float32Array(N);
    const rotations = new Float32Array(N);
    const births = new Float32Array(N);
    const velocities = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      births[i] = -9999;
      lives[i] = 1.0;
      sizes[i] = 1.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(births, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      vertexShader: mouthSmokeVert,
      fragmentShader: mouthSmokeFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
        uColorMist: { value: new THREE.Color(0.35, 0.82, 1.0) }, // Frosty cyan mist
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.group.add(this.points);
  }

  _emit(mouthPos, openPower) {
    const i = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % MOUTH_PARTICLE_COUNT;

    const pos = this.geometry.attributes.position;
    const sizes = this.geometry.attributes.aSize;
    const lives = this.geometry.attributes.aLife;
    const rots = this.geometry.attributes.aRotation;
    const births = this.geometry.attributes.aBirth;
    const vels = this.geometry.attributes.aVelocity;

    // Small spawn jitter around lips
    pos.array[i * 3] = mouthPos.x + (Math.random() - 0.5) * 0.02;
    pos.array[i * 3 + 1] = mouthPos.y + (Math.random() - 0.5) * 0.015;
    pos.array[i * 3 + 2] = mouthPos.z + 0.02;

    lives.array[i] = 1.4 + Math.random() * 0.8;
    rots.array[i] = Math.random() * Math.PI * 2;
    births.array[i] = this.time;
    sizes.array[i] = 7.0 + Math.random() * 7.0 + openPower * 5.0;

    // Velocity: flows forward toward camera (+Z) with outward spread
    const forwardSpeed = 0.08 + openPower * 0.12;
    const spreadX = (Math.random() - 0.5) * 0.05;
    const spreadY = (Math.random() - 0.5) * 0.03 + 0.015;

    vels.array[i * 3] = spreadX;
    vels.array[i * 3 + 1] = spreadY;
    vels.array[i * 3 + 2] = forwardSpeed; // Billows toward viewer

    pos.needsUpdate = true;
    sizes.needsUpdate = true;
    lives.needsUpdate = true;
    rots.needsUpdate = true;
    births.needsUpdate = true;
    vels.needsUpdate = true;
  }

  /**
   * Update mouth tracking and emit mist when mouth opens
   * @param {number} dt – Delta time
   * @param {Array<object>} faceLandmarks – 478 MediaPipe face landmarks
   * @param {function} projectFn – Mapping function from 2D video landmark to 3D world space
   * @param {number} intensity – Smoke density slider
   * @param {function} onMouthOpen – Callback to play sound when mouth opens
   */
  update(dt, faceLandmarks, projectFn, intensity = 1.0, onMouthOpen = null) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uIntensity.value = intensity;

    if (!faceLandmarks || faceLandmarks.length < 15) {
      this.isMouthOpen = false;
      this.prevMouthOpen = false;
      return;
    }

    // Landmark 13 = upper lip inner, 14 = lower lip inner
    // Landmark 10 = forehead, 152 = chin (face height normalizer)
    const upperLip = faceLandmarks[13];
    const lowerLip = faceLandmarks[14];
    const forehead = faceLandmarks[10];
    const chin = faceLandmarks[152];

    const mouthDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
    const faceHeight = Math.hypot(forehead.x - chin.x, forehead.y - chin.y) || 1.0;
    this.mouthOpenRatio = mouthDist / faceHeight;

    // Threshold: normal speaking/breathing is > 0.065, wide opening/blowing is > 0.12
    const isOpen = this.mouthOpenRatio > 0.065;
    this.isMouthOpen = isOpen;

    // Trigger audio burst on opening transition
    if (isOpen && !this.prevMouthOpen) {
      if (onMouthOpen) onMouthOpen(Math.min(this.mouthOpenRatio * 8.0, 1.5));
    }
    this.prevMouthOpen = isOpen;

    if (isOpen && intensity > 0.05) {
      // Calculate 3D position between lips
      const midLip2D = {
        x: (upperLip.x + lowerLip.x) * 0.5,
        y: (upperLip.y + lowerLip.y) * 0.5,
        z: (upperLip.z + lowerLip.z) * 0.5,
      };
      const mouthPos3D = projectFn(midLip2D);

      const openPower = Math.min((this.mouthOpenRatio - 0.065) * 12.0, 2.0);
      const emitRate = (15.0 + openPower * 35.0) * intensity;

      this.emitTimer += dt * emitRate;
      while (this.emitTimer >= 1.0) {
        this._emit(mouthPos3D, openPower);
        this.emitTimer -= 1.0;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
