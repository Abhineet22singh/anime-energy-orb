/**
 * animeFilter.js – Real-time GPU anime transformation shader for live webcam feed
 *
 * Implements:
 * 1. Bilateral skin smoothing (removes noise/blemishes while preserving facial edges)
 * 2. Sobel edge detection for hand-drawn anime ink outlines
 * 3. Discrete cel-shading & color quantization
 * 4. Distinct anime styles: Shonen, Cyberpunk, Ghibli, Manga Ink, and Natural
 * 5. Pixel-perfect aspect-ratio cover mapping matching live webcam and 3D overlay
 */

import * as THREE from 'three';

const AnimeShader = {
  uniforms: {
    tVideo: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uVideoResolution: { value: new THREE.Vector2(1280, 720) },
    uStyle: { value: 1 }, // 0=Natural, 1=Shonen, 2=Cyberpunk, 3=Ghibli, 4=Manga
    uIntensity: { value: 1.0 },
    uTime: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tVideo;
    uniform vec2 uResolution;
    uniform vec2 uVideoResolution;
    uniform int uStyle;
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;

    // Luminance calculation
    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    // RGB to HSV conversion
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    // HSV to RGB conversion
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      // ── Object-fit: cover UV calculation matching Three.js frustum ──
      vec2 st = vUv;
      float screenAspect = uResolution.x / max(uResolution.y, 1.0);
      float videoAspect = uVideoResolution.x / max(uVideoResolution.y, 1.0);
      vec2 coverUv = st;

      if (screenAspect > videoAspect) {
        float scale = videoAspect / screenAspect;
        coverUv.y = 0.5 + (st.y - 0.5) * scale;
      } else {
        float scale = screenAspect / videoAspect;
        coverUv.x = 0.5 + (st.x - 0.5) * scale;
      }

      // Mirrored horizontal sampling to match mirror selfie
      vec2 uv = vec2(1.0 - coverUv.x, coverUv.y);
      vec2 texel = 1.0 / uResolution;

      vec4 rawColor = texture2D(tVideo, uv);
      if (uStyle == 0 || uIntensity <= 0.02) {
        gl_FragColor = rawColor;
        return;
      }

      // ── 1. Edge-Preserving Surface / Bilateral Smoothing (Anime Skin) ──
      vec3 centerCol = rawColor.rgb;
      vec3 smoothCol = vec3(0.0);
      float totalWeight = 0.0;

      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          vec2 offset = vec2(float(x), float(y)) * texel * 1.5;
          vec3 sampleCol = texture2D(tVideo, uv + offset).rgb;

          // Spatial gaussian weight
          float spatialDist = float(x * x + y * y);
          float spatialWeight = exp(-spatialDist * 0.2);

          // Range / color difference weight (preserves edges like eyes, mouth, hair)
          float colorDist = length(sampleCol - centerCol);
          float rangeWeight = exp(-colorDist * colorDist * 18.0);

          float weight = spatialWeight * rangeWeight;
          smoothCol += sampleCol * weight;
          totalWeight += weight;
        }
      }
      smoothCol /= max(totalWeight, 0.001);

      // ── 2. Sobel Edge Detection (Anime Ink Outline) ──
      float t00 = getLuma(texture2D(tVideo, uv + vec2(-texel.x, -texel.y)).rgb);
      float t10 = getLuma(texture2D(tVideo, uv + vec2(0.0, -texel.y)).rgb);
      float t20 = getLuma(texture2D(tVideo, uv + vec2(texel.x, -texel.y)).rgb);

      float t01 = getLuma(texture2D(tVideo, uv + vec2(-texel.x, 0.0)).rgb);
      float t21 = getLuma(texture2D(tVideo, uv + vec2(texel.x, 0.0)).rgb);

      float t02 = getLuma(texture2D(tVideo, uv + vec2(-texel.x, texel.y)).rgb);
      float t12 = getLuma(texture2D(tVideo, uv + vec2(0.0, texel.y)).rgb);
      float t22 = getLuma(texture2D(tVideo, uv + vec2(texel.x, texel.y)).rgb);

      float gx = (t20 + 2.0 * t21 + t22) - (t00 + 2.0 * t01 + t02);
      float gy = (t02 + 2.0 * t12 + t22) - (t00 + 2.0 * t10 + t20);
      float edgeGrad = sqrt(gx * gx + gy * gy);

      // Ink outline thresholding
      float ink = smoothstep(0.12, 0.28, edgeGrad);

      // ── 3. Style Specific Palette & Cel-Shading ──
      vec3 finalCol = smoothCol;

      if (uStyle == 1) {
        // STYLE 1: Shonen Anime (Vibrant, high contrast, warm skin tone, crisp ink)
        vec3 hsv = rgb2hsv(smoothCol);
        hsv.y = clamp(hsv.y * 1.35, 0.0, 1.0); // Saturate colors
        hsv.z = clamp(hsv.z * 1.08, 0.0, 1.0);

        // 4-band cel shading
        float bands = 4.0;
        hsv.z = floor(hsv.z * bands + 0.35) / bands;

        vec3 cel = hsv2rgb(hsv);
        // Apply dark navy/sepia anime ink outline
        vec3 inkColor = vec3(0.08, 0.05, 0.12);
        finalCol = mix(cel, inkColor, ink * 0.85);

      } else if (uStyle == 2) {
        // STYLE 2: Cyberpunk / Neon Anime (Cyan & Magenta duotone shadows, glowing highlights)
        float luma = getLuma(smoothCol);
        vec3 neonCyan = vec3(0.05, 0.85, 0.95);
        vec3 neonMagenta = vec3(0.95, 0.10, 0.65);
        vec3 highlight = vec3(1.0, 0.98, 0.9);

        vec3 duotone = mix(neonCyan * 0.4, neonMagenta, smoothstep(0.2, 0.65, luma));
        duotone = mix(duotone, highlight, smoothstep(0.65, 0.95, luma));

        vec3 inkColor = vec3(0.02, 0.02, 0.06);
        finalCol = mix(mix(smoothCol, duotone, 0.65), inkColor, ink * 0.9);

      } else if (uStyle == 3) {
        // STYLE 3: Studio Ghibli (Soft watercolor, warm pastel tones, subtle earthy ink)
        vec3 hsv = rgb2hsv(smoothCol);
        hsv.y = clamp(hsv.y * 1.15, 0.0, 1.0);
        hsv.z = pow(hsv.z, 0.85); // Lift midtones

        // Soft 3-band quantization
        hsv.z = floor(hsv.z * 3.0 + 0.4) / 3.0;
        vec3 pastel = hsv2rgb(hsv);

        // Soft warm sepia ink
        vec3 inkColor = vec3(0.18, 0.12, 0.10);
        finalCol = mix(pastel, inkColor, ink * 0.6);

      } else if (uStyle == 4) {
        // STYLE 4: Manga Ink (High-contrast black & white ink illustration with screentone)
        float luma = getLuma(smoothCol);
        // Halftone / Screentone pattern
        vec2 screenPos = gl_FragCoord.xy * 0.35;
        float halftone = sin(screenPos.x) * cos(screenPos.y);

        float bw = luma > 0.55 ? 1.0 : (luma > 0.30 ? (halftone > -0.2 ? 0.75 : 0.0) : 0.0);
        finalCol = vec3(bw) * (1.0 - ink * 0.95);
      }

      // Blend between original camera feed and stylized anime result based on uIntensity
      gl_FragColor = vec4(mix(centerCol, finalCol, uIntensity), 1.0);
    }
  `,
};

export class AnimeFilter {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;

    // Dedicated lightweight WebGL renderer for the anime background
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(width, height);

    // Fullscreen quad scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Video texture
    this.videoTexture = null;

    // Shader Material
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AnimeShader.uniforms),
      vertexShader: AnimeShader.vertexShader,
      fragmentShader: AnimeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.material.uniforms.uResolution.value.set(width, height);
    this.material.uniforms.uVideoResolution.value.set(1280, 720);

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);

    this.styleIndex = 1; // Default: Shonen
    this.intensity = 1.0;
    this.time = 0;
  }

  setVideo(videoElement) {
    if (!this.videoTexture && videoElement) {
      this.videoTexture = new THREE.VideoTexture(videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.material.uniforms.tVideo.value = this.videoTexture;

      if (videoElement.videoWidth && videoElement.videoHeight) {
        this.material.uniforms.uVideoResolution.value.set(
          videoElement.videoWidth,
          videoElement.videoHeight
        );
      }
    }
  }

  setStyle(styleIdx) {
    this.styleIndex = styleIdx;
    this.material.uniforms.uStyle.value = styleIdx;
  }

  setIntensity(val) {
    this.intensity = val;
    this.material.uniforms.uIntensity.value = val;
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  updateVideoResolution(w, h) {
    if (w > 0 && h > 0) {
      this.material.uniforms.uVideoResolution.value.set(w, h);
    }
  }

  /**
   * Render stylized anime background directly to anime-canvas
   */
  render(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;

    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    if (this.videoTexture) this.videoTexture.dispose();
    this.material.dispose();
  }
}
