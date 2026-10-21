/**
 * orb.js – Procedural energy orb with GLSL shaders
 */

import * as THREE from 'three';

// ── Shader: Inner core ──

const coreVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDistort;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
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
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normal;
    vec3 pos = position;

    // Distort the sphere surface
    float n = snoise(pos * 3.0 + uTime * 0.8) * uDistort;
    float n2 = snoise(pos * 6.0 - uTime * 1.2) * uDistort * 0.5;
    pos += normal * (n + n2);

    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const coreFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCharge;
  uniform vec3 uColor1;
  uniform vec3 uColor2;

  void main() {
    // Fresnel rim
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);

    // Animated energy pattern
    float pulse = sin(uTime * 3.0) * 0.15 + 0.85;
    float pattern = sin(vPosition.x * 12.0 + uTime * 2.0)
                  * sin(vPosition.y * 12.0 - uTime * 1.5)
                  * sin(vPosition.z * 12.0 + uTime * 0.8);
    pattern = pattern * 0.5 + 0.5;

    // Mix core and rim colours
    vec3 col = mix(uColor1, uColor2, fresnel);
    col += vec3(0.3, 0.7, 1.0) * pattern * 0.4 * uIntensity;
    col *= pulse * uIntensity;

    // Charge brightening
    col += vec3(0.4, 0.8, 1.0) * uCharge * 0.5;

    float alpha = mix(0.85, 1.0, fresnel) * uIntensity;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Shader: Outer glow shell ──

const glowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const glowFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
    float pulse = sin(uTime * 2.5) * 0.1 + 0.9;
    vec3 col = uColor * fresnel * uIntensity * pulse * 2.0;
    float alpha = fresnel * 0.6 * uIntensity;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Shader: Energy ring ──

const ringVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float r = length(uv);
    float ring = smoothstep(0.7, 0.75, r) * smoothstep(0.85, 0.8, r);
    float energy = sin(atan(uv.y, uv.x) * 8.0 + uTime * 4.0) * 0.5 + 0.5;
    energy *= sin(atan(uv.y, uv.x) * 3.0 - uTime * 2.0) * 0.5 + 0.5;
    ring *= energy;
    float pulse = sin(uTime * 3.0) * 0.2 + 0.8;
    vec3 col = uColor * ring * uIntensity * pulse * 3.0;
    float alpha = ring * uIntensity * 0.7;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Orb class ──

export class EnergyOrb {
  constructor() {
    this.group = new THREE.Group();
    this.targetScale = 1;
    this.currentScale = 0;
    this.targetIntensity = 0;
    this.currentIntensity = 0;
    this.charge = 0;
    this.targetCharge = 0;
    this.visible = false;
    this.time = 0;

    this._createCore();
    this._createGlowShells();
    this._createEnergyRings();
    this._createPointLight();
  }

  _createCore() {
    const geo = new THREE.IcosahedronGeometry(0.12, 5);
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDistort: { value: 0.025 },
        uIntensity: { value: 1.0 },
        uCharge: { value: 0 },
        uColor1: { value: new THREE.Color(0.1, 0.6, 1.0) },
        uColor2: { value: new THREE.Color(0.5, 0.9, 1.0) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.coreMesh = new THREE.Mesh(geo, this.coreMat);
    this.group.add(this.coreMesh);
  }

  _createGlowShells() {
    this.glowShells = [];
    const scales = [1.4, 1.8, 2.4];
    const colors = [
      new THREE.Color(0.1, 0.5, 1.0),
      new THREE.Color(0.05, 0.3, 0.9),
      new THREE.Color(0.02, 0.15, 0.6),
    ];
    for (let i = 0; i < scales.length; i++) {
      const geo = new THREE.IcosahedronGeometry(0.12 * scales[i], 3);
      const mat = new THREE.ShaderMaterial({
        vertexShader: glowVertexShader,
        fragmentShader: glowFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 1.0 },
          uColor: { value: colors[i] },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.glowShells.push({ mesh, mat });
      this.group.add(mesh);
    }
  }

  _createEnergyRings() {
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(0.5, 0.5);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 1.0 },
          uColor: { value: new THREE.Color(0.2, 0.6, 1.0) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = (Math.PI / 3) * i;
      mesh.rotation.y = (Math.PI / 4) * i;
      this.rings.push({ mesh, mat, baseRotX: mesh.rotation.x, baseRotY: mesh.rotation.y });
      this.group.add(mesh);
    }
  }

  _createPointLight() {
    this.light = new THREE.PointLight(0x00aaff, 0, 3);
    this.group.add(this.light);
  }

  /**
   * Show the orb.
   */
  show() {
    this.visible = true;
    this.targetIntensity = 1;
  }

  /**
   * Hide the orb (fade out).
   */
  hide() {
    this.visible = false;
    this.targetIntensity = 0;
  }

  /**
   * Set charge level (0-1).
   */
  setCharge(c) {
    this.targetCharge = c;
  }

  /**
   * Set scale multiplier.
   */
  setScale(s) {
    this.targetScale = s;
  }

  /**
   * Update the orb each frame.
   * @param {number} dt – delta time in seconds
   * @param {number} intensity – energy intensity multiplier from UI
   */
  update(dt, intensity = 1) {
    this.time += dt;

    // Smooth transitions
    const lerpFactor = 1 - Math.pow(0.001, dt);
    this.currentScale += (this.targetScale - this.currentScale) * lerpFactor;
    this.currentIntensity += (this.targetIntensity - this.currentIntensity) * lerpFactor;
    this.charge += (this.targetCharge - this.charge) * lerpFactor;

    const effectiveIntensity = this.currentIntensity * intensity;

    // Scale
    const s = this.currentScale * (1 + this.charge * 0.15);
    this.group.scale.setScalar(s);

    // Core uniforms
    this.coreMat.uniforms.uTime.value = this.time;
    this.coreMat.uniforms.uIntensity.value = effectiveIntensity;
    this.coreMat.uniforms.uCharge.value = this.charge;
    this.coreMat.uniforms.uDistort.value = 0.025 + this.charge * 0.04;

    // Glow shells
    for (const shell of this.glowShells) {
      shell.mat.uniforms.uTime.value = this.time;
      shell.mat.uniforms.uIntensity.value = effectiveIntensity;
    }

    // Energy rings
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      ring.mat.uniforms.uTime.value = this.time;
      ring.mat.uniforms.uIntensity.value = effectiveIntensity * 0.7;
      ring.mesh.rotation.x = ring.baseRotX + this.time * (0.5 + i * 0.3);
      ring.mesh.rotation.y = ring.baseRotY + this.time * (0.3 + i * 0.2);
    }

    // Light
    this.light.intensity = effectiveIntensity * 2 * (1 + this.charge);
    this.light.color.setHSL(0.55, 1, 0.5 + this.charge * 0.2);

    // Visibility
    this.group.visible = this.currentIntensity > 0.01;
  }

  /**
   * Position the orb in world space.
   */
  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  /**
   * Dispose GPU resources.
   */
  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.dispose) child.material.dispose();
      }
    });
  }
}
