/**
 * orb.js – Exact reference recreation of the anime blue-white energy orb
 *
 * Layered procedural rendering:
 * 1. Intensely luminous white-cyan core with soft exponential falloff
 * 2. Translucent plasma energy shell with uneven, animated fractal noise displacement
 * 3. Flowing blue plasma filaments & soft internal turbulence
 * 4. Rotating energy vortex wisps & currents
 * 5. Soft ambient blue aura fading naturally into camera footage
 */

import * as THREE from 'three';

// ── 1. Plasma Shell Shaders (Displaced uneven edges & flowing plasma) ──

const plasmaVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uDistort;

  // Optimized Simplex Noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;

    // Multi-octave organic surface displacement
    float n1 = snoise(position * 4.5 + vec3(uTime * 1.2, uTime * 0.8, -uTime * 1.0));
    float n2 = snoise(position * 9.0 - vec3(uTime * 1.8, -uTime * 1.5, uTime * 1.2));
    float displacement = (n1 * 0.65 + n2 * 0.35) * uDistort;

    vec3 displaced = position + normal * displacement;
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const plasmaFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCharge;
  uniform vec3 uColorCore;
  uniform vec3 uColorHalo;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(viewDir, vNormal), 0.0);

    // Fresnel rim effect
    float fresnel = pow(1.0 - NdotV, 2.2);

    // Animated internal plasma swirls
    float plasma = sin(vLocalPos.x * 16.0 + uTime * 4.0)
                 * sin(vLocalPos.y * 16.0 - uTime * 3.5)
                 * sin(vLocalPos.z * 16.0 + uTime * 2.5);
    plasma = plasma * 0.5 + 0.5;

    // Micro turbulence pulse
    float pulse = sin(uTime * 6.0) * 0.1 + 0.9;

    // Blend from intense white-cyan core to translucent electric blue halo
    vec3 col = mix(uColorCore, uColorHalo, 1.0 - fresnel * 0.8);
    col += vec3(0.5, 0.9, 1.0) * plasma * 0.6;
    col *= (1.0 + uCharge * 0.8) * pulse;

    // Airy, translucent appearance (person's hand/face visible through center)
    float alpha = mix(0.25, 0.85, fresnel) * uIntensity;
    alpha += plasma * 0.15;

    gl_FragColor = vec4(col * uIntensity * 1.6, alpha);
  }
`;

// ── 2. White-Hot Luminous Core Billboard Shader ──

const coreGlowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coreGlowFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCharge;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float dist = length(p);
    if (dist > 1.0) discard;

    // Intense inverse-exponential white-hot center
    float coreFalloff = exp(-dist * 4.5);
    float haloFalloff = exp(-dist * 2.0);

    // Rapid subtle micro-pulsing
    float twinkle = sin(uTime * 8.0) * 0.05 + 0.95;

    // Pure brilliant white at center, vibrant cyan mid, deep blue edge
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 cyan = vec3(0.4, 0.92, 1.0);
    vec3 blue = vec3(0.05, 0.45, 1.0);

    vec3 col = mix(cyan, white, smoothstep(0.4, 0.0, dist));
    col = mix(blue, col, coreFalloff);

    float alpha = (coreFalloff * 0.95 + haloFalloff * 0.35) * uIntensity * twinkle;
    alpha *= (1.0 + uCharge * 0.5);

    gl_FragColor = vec4(col * (1.2 + uCharge * 0.8), alpha);
  }
`;

// ── 3. Rotating Energy Vortex Whisps Shader ──

const vortexFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || r < 0.2) discard;

    float angle = atan(p.y, p.x);
    // Logarithmic spiral motion
    float spiral = sin(angle * 4.0 - log(r + 0.001) * 6.0 + uTime * uSpeed);
    float ring = smoothstep(0.2, 0.6, r) * smoothstep(1.0, 0.7, r);
    float alpha = max(spiral, 0.0) * ring * uIntensity * 0.6;

    vec3 col = vec3(0.3, 0.85, 1.0) * 1.5;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── 4. Soft Atmospheric Aura Shader ──

const auraFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uIntensity;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float dist = length(p);
    if (dist > 1.0) discard;

    // Soft Gaussian-like aura that blends seamlessly into webcam feed
    float glow = exp(-dist * 2.8) * (1.0 - smoothstep(0.7, 1.0, dist));
    vec3 col = vec3(0.1, 0.5, 0.95);

    gl_FragColor = vec4(col, glow * uIntensity * 0.3);
  }
`;

export class EnergyOrb {
  constructor() {
    this.group = new THREE.Group();
    this.baseRadius = 0.075; // Baseline palm-sized radius in world units (~7.5cm)
    this.targetScale = 1.0;
    this.currentScale = 0.0;
    this.targetIntensity = 0.0;
    this.currentIntensity = 0.0;
    this.charge = 0.0;
    this.targetCharge = 0.0;
    this.visible = false;
    this.time = 0;

    this._createAtmosphericAura();
    this._createCoreBillboard();
    this._createPlasmaShells();
    this._createVortexWisps();
    this._createEscapingParticles();
    this._createPointLight();
  }

  _createAtmosphericAura() {
    const geo = new THREE.PlaneGeometry(0.55, 0.55);
    this.auraMat = new THREE.ShaderMaterial({
      vertexShader: coreGlowVert,
      fragmentShader: auraFrag,
      uniforms: {
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.auraMesh = new THREE.Mesh(geo, this.auraMat);
    this.group.add(this.auraMesh);
  }

  _createCoreBillboard() {
    // Center brilliant white-cyan core
    const geo = new THREE.PlaneGeometry(0.24, 0.24);
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: coreGlowVert,
      fragmentShader: coreGlowFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uCharge: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.coreBillboard = new THREE.Mesh(geo, this.coreMat);
    this.group.add(this.coreBillboard);
  }

  _createPlasmaShells() {
    this.plasmaShells = [];

    // Inner translucent shell
    const innerGeo = new THREE.IcosahedronGeometry(this.baseRadius, 5);
    this.innerMat = new THREE.ShaderMaterial({
      vertexShader: plasmaVertexShader,
      fragmentShader: plasmaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDistort: { value: 0.022 },
        uIntensity: { value: 0 },
        uCharge: { value: 0 },
        uColorCore: { value: new THREE.Color(0.85, 0.98, 1.0) }, // Brilliant white-cyan
        uColorHalo: { value: new THREE.Color(0.08, 0.55, 1.0) }, // Vibrant electric blue
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const innerMesh = new THREE.Mesh(innerGeo, this.innerMat);
    this.group.add(innerMesh);
    this.plasmaShells.push({ mesh: innerMesh, mat: this.innerMat, rotSpeed: 0.8 });

    // Outer turbulent wisp shell
    const outerGeo = new THREE.IcosahedronGeometry(this.baseRadius * 1.35, 4);
    this.outerMat = new THREE.ShaderMaterial({
      vertexShader: plasmaVertexShader,
      fragmentShader: plasmaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDistort: { value: 0.038 },
        uIntensity: { value: 0 },
        uCharge: { value: 0 },
        uColorCore: { value: new THREE.Color(0.2, 0.7, 1.0) },
        uColorHalo: { value: new THREE.Color(0.03, 0.35, 0.9) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const outerMesh = new THREE.Mesh(outerGeo, this.outerMat);
    this.group.add(outerMesh);
    this.plasmaShells.push({ mesh: outerMesh, mat: this.outerMat, rotSpeed: -0.6 });
  }

  _createVortexWisps() {
    this.wisps = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(0.26, 0.26);
      const mat = new THREE.ShaderMaterial({
        vertexShader: coreGlowVert,
        fragmentShader: vortexFrag,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uSpeed: { value: 5.0 + i * 2.0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI * 0.25 * i;
      mesh.rotation.y = Math.PI * 0.35 * i;
      this.group.add(mesh);
      this.wisps.push({ mesh, mat, axis: new THREE.Vector3(i === 0 ? 1 : 0, 1, i === 2 ? 1 : 0).normalize(), speed: 1.5 + i * 0.8 });
    }
  }

  _createEscapingParticles() {
    const count = 45;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const speeds = new Float32Array(count);
    const dirs = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      lives[i] = Math.random();
      speeds[i] = 0.08 + Math.random() * 0.12;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      dirs[i * 3] = Math.sin(phi) * Math.cos(theta);
      dirs[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
      dirs[i * 3 + 2] = Math.cos(phi);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));

    const escapeShader = {
      vertexShader: /* glsl */ `
        attribute float aLife;
        attribute float aSpeed;
        attribute vec3 aDir;
        uniform float uTime;
        uniform float uIntensity;
        varying float vAlpha;

        void main() {
          float t = mod(uTime * aSpeed + aLife, 1.0);
          // Emerge from surface and float upward
          vec3 pos = aDir * (0.07 + t * 0.1) + vec3(0.0, t * 0.05, 0.0);
          vAlpha = (1.0 - t) * smoothstep(0.0, 0.2, t) * uIntensity;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (3.5 * (1.0 - t) + 1.5) * (140.0 / max(-mvPos.z, 0.5));
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float glow = exp(-d * 3.0);
          vec3 col = mix(vec3(0.2, 0.7, 1.0), vec3(1.0, 1.0, 1.0), glow);
          gl_FragColor = vec4(col, glow * vAlpha);
        }
      `,
    };

    this.escapeMat = new THREE.ShaderMaterial({
      vertexShader: escapeShader.vertexShader,
      fragmentShader: escapeShader.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.escapeParticles = new THREE.Points(geo, this.escapeMat);
    this.group.add(this.escapeParticles);
  }

  _createPointLight() {
    this.light = new THREE.PointLight(0x00d4ff, 0, 2.5);
    this.group.add(this.light);
  }

  show() {
    this.visible = true;
    this.targetIntensity = 1.0;
  }

  hide() {
    this.visible = false;
    this.targetIntensity = 0.0;
  }

  setCharge(c) {
    this.targetCharge = c;
  }

  setScale(s) {
    this.targetScale = s;
  }

  update(dt, intensity = 1.0, cameraRef = null) {
    this.time += dt;

    // Smooth state transitions
    const lerpRate = 1 - Math.pow(0.001, dt);
    this.currentScale += (this.targetScale - this.currentScale) * lerpRate;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * lerpRate;
    this.charge += (this.targetCharge - this.charge) * lerpRate;

    const effIntensity = this.currentIntensity * intensity;

    if (effIntensity < 0.01) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Dynamic scale (compact when charging into a fist, palm-sized when open)
    const s = this.currentScale * (1.0 - this.charge * 0.35);
    this.group.scale.setScalar(s);

    // Billboards face camera
    if (cameraRef) {
      this.coreBillboard.quaternion.copy(cameraRef.quaternion);
      this.auraMesh.quaternion.copy(cameraRef.quaternion);
    }

    // 1. Update Core Billboard
    this.coreMat.uniforms.uTime.value = this.time;
    this.coreMat.uniforms.uIntensity.value = effIntensity;
    this.coreMat.uniforms.uCharge.value = this.charge;

    // 2. Update Aura
    this.auraMat.uniforms.uIntensity.value = effIntensity * (1.0 + this.charge * 0.5);

    // 3. Update Plasma Shells
    for (let i = 0; i < this.plasmaShells.length; i++) {
      const shell = this.plasmaShells[i];
      shell.mat.uniforms.uTime.value = this.time;
      shell.mat.uniforms.uIntensity.value = effIntensity;
      shell.mat.uniforms.uCharge.value = this.charge;
      shell.mesh.rotation.y += dt * shell.rotSpeed;
      shell.mesh.rotation.z += dt * shell.rotSpeed * 0.5;
    }

    // 4. Update Vortex Wisps
    for (let i = 0; i < this.wisps.length; i++) {
      const wisp = this.wisps[i];
      wisp.mat.uniforms.uTime.value = this.time;
      wisp.mat.uniforms.uIntensity.value = effIntensity * 0.75;
      wisp.mesh.rotateOnAxis(wisp.axis, dt * wisp.speed);
    }

    // 5. Update Escaping Particles
    this.escapeMat.uniforms.uTime.value = this.time;
    this.escapeMat.uniforms.uIntensity.value = effIntensity;

    // 6. Point Light (Soft blue light spill on palm)
    this.light.intensity = effIntensity * (1.8 + this.charge * 2.2);
    this.light.color.setHSL(0.53, 0.95, 0.55 + this.charge * 0.25);
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.dispose) child.material.dispose();
      }
    });
  }
}
