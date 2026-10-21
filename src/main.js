/**
 * main.js – Complete Production AI Anime Effect Studio
 *
 * Real-Time Features:
 * - GPU-accelerated Anime Face Stylization (Bilateral skin smoothing, Sobel ink outlines, Cel-shading)
 * - 5 Presets: Shonen, Cyberpunk, Ghibli, Manga Ink, Natural
 * - Real live webcam background showing user's actual face, hair, body, and raised hand
 * - Floating blue-white plasma energy orb with simplex noise displacement
 * - Animated orange and amber energy strands wrapping around fingers and palm
 * - Translucent blue smoke curling from palm across chest and towards face with eye clarity protection
 * - Real-time mouth-triggered breath mist billowing towards camera when mouth opens or exhales
 * - Index fingertip tracking with glowing orange particle trails, sparks, and 3D air-drawing
 * - HD video recording with Web Audio sound capture (.webm/.mp4) and composite selfie snapshot
 */

import * as THREE from 'three';
import { startCamera, stopCamera, isCameraReady, getVideo } from './camera.js';
import { initVisionTracking, detectVision, isTrackingReady, hasFaceTracking } from './handTracking.js';
import { processGestures, isTwoHandOpen, twoHandMidpoint, twoHandDistance } from './gestures.js';
import { EnergyOrb } from './orb.js';
import { OrangeFilaments } from './orangeFilaments.js';
import { OrbParticles } from './particles.js';
import { OrbSmoke } from './smoke.js';
import { createPostProcessing, ElectricalArcs, ShockwaveRing } from './effects.js';
import { HandSkeleton } from './handSkeleton.js';
import { soundFX } from './audio.js';
import { AnimeFilter } from './animeFilter.js';
import { MouthSmoke } from './mouthSmoke.js';
import { AirDrawing } from './airDrawing.js';
import { videoRecorder } from './recorder.js';
import {
  initUI, setModelReady, setStatusText, enterExperience, setGestureDisplay,
  getSettings, setupCompositeScreenshot, updateFramingGuidance, resetFramingHint,
  setRecordingUI, setAirDrawUI, setActiveStyleUI,
} from './ui.js';

// ── Application State ──
let renderer, scene, camera, composer, bloomPass;
let orb, orangeFilaments, particles, smoke, arcs, shockwave, handSkeleton;
let animeFilter, mouthSmoke, airDrawing;
let running = false;
let interactiveMode = false;
let lastTime = 0;
let animFrameId = null;
let pointerPos = { x: 0.5, y: 0.5 };
let interactiveGestureIndex = 0;
const INTERACTIVE_GESTURES = ['open', 'fist', 'pinch'];
let prevGesture = 'none';

// ── Application Initialization ──

async function init() {
  initUI({
    onEnter: handleEnter,
    onReset: handleReset,
    onSoundToggle: () => soundFX.toggle(),
    onStyleChange: (idx) => animeFilter?.setStyle(idx),
    onToggleRecord: handleToggleRecord,
    onToggleAirDraw: (enabled) => airDrawing?.setDrawingMode(enabled),
    onClearDrawing: () => airDrawing?.clearDrawing(),
  });

  // 1. Three.js High-Performance Setup with alpha transparency for live camera compositing
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true, // Required for composite mirror snapshot & video recording
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // 100% transparent background
  renderer.autoClear = false;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 2;

  scene.add(new THREE.AmbientLight(0x0c1b33, 0.35));

  // 2. Initialize GPU Anime Stylization Filter on background canvas
  const animeCanvas = document.getElementById('anime-canvas');
  if (animeCanvas) {
    animeFilter = new AnimeFilter(animeCanvas, window.innerWidth, window.innerHeight);
    animeFilter.setStyle(getSettings().animeStyle);
  }

  // 3. Visual Effect Nodes
  orb = new EnergyOrb();
  scene.add(orb.group);

  orangeFilaments = new OrangeFilaments();
  scene.add(orangeFilaments.group);

  particles = new OrbParticles();
  scene.add(particles.group);

  smoke = new OrbSmoke();
  scene.add(smoke.group);

  mouthSmoke = new MouthSmoke();
  scene.add(mouthSmoke.group);

  airDrawing = new AirDrawing();
  scene.add(airDrawing.group);

  arcs = new ElectricalArcs();
  scene.add(arcs.group);

  shockwave = new ShockwaveRing();
  scene.add(shockwave.group);

  handSkeleton = new HandSkeleton();
  scene.add(handSkeleton.group);

  // 4. Post-Processing Pipeline (Transparent Bloom Pass)
  const pp = createPostProcessing(renderer, scene, camera, window.innerWidth, window.innerHeight);
  composer = pp.composer;
  bloomPass = pp.bloomPass;

  // 5. Setup Composite Mirror Screenshot (Webcam Video + Three.js VFX)
  setupCompositeScreenshot(renderer);

  // 6. Global Resize & Interaction Listeners
  window.addEventListener('resize', onResize);
  setupInteractionEvents();

  // 7. Preload Vision AI (Dual Hand + Face Tracking)
  setStatusText('INITIALIZING AI VISION…');
  try {
    await initVisionTracking((msg) => setStatusText(msg.toUpperCase()));
    setModelReady();
  } catch (err) {
    console.warn('Vision model init error, defaulting to interactive mode:', err);
    setModelReady();
  }

  lastTime = performance.now();
  animate(performance.now());
}

// ── User Entrance ──

async function handleEnter() {
  soundFX.init();
  soundFX.resume();
  soundFX.playBurst(0.7);

  enterExperience();

  const video = document.getElementById('camera-feed');
  try {
    await startCamera(video);
    running = true;
    interactiveMode = false;

    // Attach video stream to Anime filter
    if (animeFilter) {
      animeFilter.setVideo(video);
      if (video.videoWidth && video.videoHeight) {
        animeFilter.updateVideoResolution(video.videoWidth, video.videoHeight);
      }
    }
  } catch (err) {
    console.warn('Camera access denied or unavailable; activating interactive touch/mouse mode:', err);
    running = true;
    interactiveMode = true;
    orb.show();
    orangeFilaments.show();
    setGestureDisplay('open');
  }
}

function handleReset() {
  orb.hide();
  orangeFilaments.hide();
  orb.setCharge(0);
  orb.setScale(1);
  airDrawing?.clearDrawing();
  soundFX.update(0, 0, 0);
  setGestureDisplay('none');
  resetFramingHint();
}

function handleToggleRecord() {
  if (videoRecorder.isRecording()) {
    videoRecorder.stopRecording();
    setRecordingUI(false);
  } else {
    const settings = getSettings();
    videoRecorder.startRecording({
      getBackgroundCanvas: () => {
        const animeCanvas = document.getElementById('anime-canvas');
        if (settings.animeFilterEnabled && settings.animeStyle !== 0 && animeCanvas) {
          return animeCanvas;
        }
        return document.getElementById('camera-feed');
      },
      getForegroundCanvas: () => renderer.domElement,
      audioStream: soundFX.getAudioStream(),
      onTick: (timerText) => setRecordingUI(true, timerText),
      onError: (err) => {
        console.error('Recording error:', err);
        setRecordingUI(false);
      },
    });
    setRecordingUI(true, '00:00');
  }
}

// ── User Input & Gestures ──

function setupInteractionEvents() {
  const updatePointer = (clientX, clientY) => {
    pointerPos.x = clientX / window.innerWidth;
    pointerPos.y = clientY / window.innerHeight;
  };

  window.addEventListener('mousemove', (e) => {
    updatePointer(e.clientX, e.clientY);
  });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  // Interactive fallback / click interactions
  window.addEventListener('click', (e) => {
    soundFX.init();
    soundFX.resume();

    if (e.target.closest('#side-panel, #top-bar, .summon-btn')) return;

    if (interactiveMode) {
      interactiveGestureIndex = (interactiveGestureIndex + 1) % INTERACTIVE_GESTURES.length;
      const g = INTERACTIVE_GESTURES[interactiveGestureIndex];
      setGestureDisplay(g);

      if (g === 'open' && prevGesture === 'fist') {
        soundFX.playBurst(1.2);
        const w = palmToWorld(pointerPos, 0.12);
        shockwave.trigger(w.x, w.y, w.z, getSettings().orbSize);
      }
      prevGesture = g;
    }
  });

  // Mouse wheel quick scale
  window.addEventListener('wheel', (e) => {
    const slider = document.getElementById('slider-orb-size');
    const valBadge = document.getElementById('val-orb-size');
    if (!slider) return;
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newVal = Math.min(Math.max(parseFloat(slider.value) + delta, 0.4), 2.5);
    slider.value = newVal;
    if (valBadge) valBadge.textContent = `${newVal.toFixed(2)}x`;
    getSettings().orbSize = newVal;
  }, { passive: true });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      handleReset();
    } else if (e.code === 'KeyM') {
      const btn = document.getElementById('btn-sound');
      const state = soundFX.toggle();
      if (btn) btn.textContent = state ? '🔊' : '🔇';
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      handleToggleRecord();
    } else if (e.code === 'KeyD') {
      const s = getSettings();
      s.airDrawEnabled = !s.airDrawEnabled;
      setAirDrawUI(s.airDrawEnabled);
      airDrawing?.setDrawingMode(s.airDrawEnabled);
      const chk = document.getElementById('toggle-airdraw');
      if (chk) chk.checked = s.airDrawEnabled;
    } else if (e.code === 'KeyC') {
      airDrawing?.clearDrawing();
    } else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } else if (e.code >= 'Digit0' && e.code <= 'Digit4') {
      const styleIdx = parseInt(e.key, 10);
      setActiveStyleUI(styleIdx);
      animeFilter?.setStyle(styleIdx);
    }
  });
}

// ── Screen Resize ──

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  if (bloomPass) {
    bloomPass.resolution.set(w, h);
  }
  if (animeFilter) {
    animeFilter.setSize(w, h);
    const video = getVideo();
    if (video && video.videoWidth && video.videoHeight) {
      animeFilter.updateVideoResolution(video.videoWidth, video.videoHeight);
    }
  }
}

// ── Mathematical Screen-to-3D Frustum Projection ──

function palmToWorld(pt, offsetUp = 0.12) {
  let screenX = 1 - pt.x; // Horizontal mirror for webcam
  let screenY = pt.y;

  const video = getVideo();
  if (video && video.videoWidth && video.videoHeight) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const ww = window.innerWidth;
    const wh = window.innerHeight;

    const videoAspect = vw / vh;
    const windowAspect = ww / wh;

    // Compensate for CSS object-fit: cover cropping
    if (windowAspect > videoAspect) {
      const renderH = ww / videoAspect;
      const cropY = (renderH - wh) / 2;
      screenY = (pt.y * renderH - cropY) / wh;
    } else {
      const renderW = wh * videoAspect;
      const cropX = (renderW - ww) / 2;
      screenX = ((1 - pt.x) * renderW - cropX) / ww;
    }
  }

  const ndcX = screenX * 2 - 1;
  const ndcY = -(screenY * 2 - 1);

  const fovRad = (camera.fov * Math.PI) / 180;
  const halfHeight = Math.tan(fovRad / 2) * camera.position.z;
  const halfWidth = halfHeight * camera.aspect;

  const worldX = ndcX * halfWidth;
  const worldY = ndcY * halfHeight + offsetUp;
  const worldZ = pt.z ? -pt.z * 1.5 : 0;

  return { x: worldX, y: worldY, z: worldZ };
}

// ── Synthetic Hand Landmarks (for Interactive fallback mode) ──

function generateSyntheticLandmarks(pt, gesture) {
  const lm = [];
  const cx = 1 - pt.x;
  const cy = pt.y;

  lm.push({ x: cx, y: cy + 0.12, z: 0 }); // 0: Wrist

  const fingers = [
    { base: [-0.06, 0.04], tip: [-0.10, -0.04], curl: gesture === 'fist' ? 0.35 : 1.0 }, // Thumb
    { base: [-0.03, -0.01], tip: [-0.04, -0.12], curl: gesture === 'fist' ? 0.25 : 1.0 }, // Index
    { base: [0.00, -0.02], tip: [0.00, -0.14], curl: gesture === 'fist' ? 0.22 : 1.0 },  // Middle
    { base: [0.03, -0.01], tip: [0.03, -0.12], curl: gesture === 'fist' ? 0.25 : 1.0 },  // Ring
    { base: [0.05, 0.02], tip: [0.07, -0.09], curl: gesture === 'fist' ? 0.30 : 1.0 },   // Pinky
  ];

  if (gesture === 'pinch') {
    fingers[0].tip = [-0.02, -0.04];
    fingers[1].tip = [-0.02, -0.04];
  }

  for (let f = 0; f < 5; f++) {
    const { base, tip, curl } = fingers[f];
    for (let j = 1; j <= 4; j++) {
      const t = (j / 4) * curl;
      lm.push({
        x: cx + base[0] + (tip[0] - base[0]) * t,
        y: cy + base[1] + (tip[1] - base[1]) * t,
        z: 0,
      });
    }
  }

  return lm;
}

// ── Render & Animation Loop ──

function animate(now) {
  animFrameId = requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  const settings = getSettings();
  let currentSpeed = 0;
  let activeHandVel = { x: 0, y: 0 };
  let orbPos = { x: 0, y: 0, z: 0 };
  let currentHandScale = 1.0;
  let faceData = null;

  // ── 0. GPU Anime Stylization Render Pass (Background) ──
  if (animeFilter) {
    const animeCanvas = document.getElementById('anime-canvas');
    if (settings.animeFilterEnabled && settings.animeStyle !== 0 && isCameraReady()) {
      if (animeCanvas && animeCanvas.style.display !== 'block') {
        animeCanvas.style.display = 'block';
      }
      animeFilter.setIntensity(settings.animeIntensity);
      animeFilter.setStyle(settings.animeStyle);
      animeFilter.render(dt);
    } else {
      if (animeCanvas && animeCanvas.style.display !== 'none') {
        animeCanvas.style.display = 'none';
      }
    }
  }

  // ── 1. Live Hand & Face Tracking Mode ──
  let hands = null;
  if (running && !interactiveMode && isCameraReady() && isTrackingReady()) {
    const video = getVideo();
    const vision = detectVision(video, now);

    // Extract Face Data & Trigger Cold Breath Mist
    if (vision.face && vision.face.faceLandmarks && vision.face.faceLandmarks.length > 0) {
      const flm = vision.face.faceLandmarks[0];
      const leftEye = palmToWorld(flm[33], 0);
      const rightEye = palmToWorld(flm[263], 0);
      const noseTip = palmToWorld(flm[4], 0);
      faceData = { leftEye, rightEye, faceCenter: noseTip };

      // Mouth breath mist & cold vapor emitter
      mouthSmoke.update(
        dt,
        flm,
        (lm) => palmToWorld(lm, 0),
        settings.mouthSmokeEnabled ? settings.smokeDensity : 0,
        (power) => soundFX.playBreath(power)
      );
    } else {
      mouthSmoke.update(dt, null, null, 0);
    }

    hands = processGestures(vision.hands, dt);
    const anyPresent = hands.some((h) => h.present);
    const hasFace = !!(vision.face && vision.face.faceLandmarks && vision.face.faceLandmarks.length > 0);
    updateFramingGuidance(hasFace, anyPresent, dt);

    if (anyPresent) {
      const primary = hands.find((h) => h.present);
      currentSpeed = primary.speed;
      activeHandVel = primary.velocity;
      currentHandScale = primary.handScale || 1.0;

      // Charge Burst Detection (Fist -> Open)
      if (prevGesture === 'fist' && primary.gesture === 'open') {
        const burstPos = palmToWorld(primary.palm, 0.12 * currentHandScale);
        shockwave.trigger(burstPos.x, burstPos.y, burstPos.z, settings.orbSize * currentHandScale * 1.5);
        soundFX.playBurst(1.3);
      }
      prevGesture = primary.gesture;

      // 3D Air-Drawing & Fingertip Spark Trails (Index Tip = Landmark 8)
      if (primary.landmarks && primary.landmarks.length > 8) {
        const indexTip3D = palmToWorld(primary.landmarks[8], 0);
        airDrawing.update(dt, indexTip3D, true, settings.energy);
      } else {
        airDrawing.update(dt, null, false, settings.energy);
      }

      // Two-Hand Mega Orb
      if (isTwoHandOpen(hands)) {
        setGestureDisplay(primary.gesture, true);
        const mid = twoHandMidpoint(hands);
        const dist = twoHandDistance(hands);
        orbPos = palmToWorld(mid, 0.08 * currentHandScale);
        const megaScale = Math.min(Math.max(dist * 4.2, 0.7), 2.8) * settings.orbSize * currentHandScale;

        orb.show();
        orb.setScale(megaScale);
        orb.setCharge(0.4);
        orb.setPosition(orbPos.x, orbPos.y, orbPos.z);
        particles.setPosition(orbPos.x, orbPos.y, orbPos.z);
        arcs.setPosition(orbPos.x, orbPos.y, orbPos.z);

        if (settings.filamentsEnabled) {
          orangeFilaments.show();
          orangeFilaments.update(dt, primary.landmarks, (lm) => palmToWorld(lm, 0), currentHandScale);
        } else {
          orangeFilaments.hide();
        }
      } else {
        // Single Hand Interaction
        setGestureDisplay(primary.gesture, false);
        const offsetAbovePalm = 0.14 * currentHandScale;
        orbPos = palmToWorld(primary.palm, offsetAbovePalm);

        if (primary.gesture === 'open') {
          orb.show();
          orb.setCharge(0.0);
          orb.setScale(settings.orbSize * currentHandScale);
        } else if (primary.gesture === 'fist') {
          orb.show();
          orb.setCharge(1.0);
          orb.setScale(settings.orbSize * currentHandScale * 0.55);
        } else if (primary.gesture === 'pinch') {
          orb.show();
          orb.setCharge(0.3);
          const pinchScale = Math.min(Math.max(primary.pinchDist * 2.8, 0.3), 2.5);
          orb.setScale(settings.orbSize * currentHandScale * pinchScale);
        } else {
          orb.hide();
        }

        orb.setPosition(orbPos.x, orbPos.y, orbPos.z);
        particles.setPosition(orbPos.x, orbPos.y, orbPos.z);
        arcs.setPosition(orbPos.x, orbPos.y, orbPos.z);

        // Orange Energy Filaments wrapping directly around the real fingers & palm
        if (settings.filamentsEnabled) {
          orangeFilaments.show();
          orangeFilaments.update(dt, primary.landmarks, (lm) => palmToWorld(lm, 0), currentHandScale);
        } else {
          orangeFilaments.hide();
        }
      }

      if (settings.skeletonEnabled) {
        handSkeleton.update(primary.landmarks, (lm) => palmToWorld(lm, 0), orb.currentIntensity > 0.05, settings.energy);
      } else {
        handSkeleton.update(null, null, false);
      }
    } else {
      setGestureDisplay('none');
      orb.hide();
      orangeFilaments.hide();
      handSkeleton.update(null, null, false);
      airDrawing.update(dt, null, false, settings.energy);
      prevGesture = 'none';
    }
  }

  // ── 2. Interactive Fallback Mode (Mouse/Touch Simulation) ──
  if (interactiveMode && running) {
    currentHandScale = 1.0;
    const activeGesture = INTERACTIVE_GESTURES[interactiveGestureIndex];
    orbPos = palmToWorld(pointerPos, 0.14);

    if (activeGesture === 'open') {
      orb.show();
      orb.setCharge(0.0);
      orb.setScale(settings.orbSize);
    } else if (activeGesture === 'fist') {
      orb.show();
      orb.setCharge(1.0);
      orb.setScale(settings.orbSize * 0.55);
    } else if (activeGesture === 'pinch') {
      orb.show();
      orb.setCharge(0.3);
      orb.setScale(settings.orbSize * 0.45);
    }

    orb.setPosition(orbPos.x, orbPos.y, orbPos.z);
    particles.setPosition(orbPos.x, orbPos.y, orbPos.z);
    arcs.setPosition(orbPos.x, orbPos.y, orbPos.z);

    const syntheticLandmarks = generateSyntheticLandmarks(pointerPos, activeGesture);
    if (settings.filamentsEnabled) {
      orangeFilaments.show();
      orangeFilaments.update(dt, syntheticLandmarks, (lm) => palmToWorld(lm, 0), 1.0);
    } else {
      orangeFilaments.hide();
    }

    if (settings.skeletonEnabled) {
      handSkeleton.update(syntheticLandmarks, (lm) => palmToWorld(lm, 0), orb.currentIntensity > 0.05, settings.energy);
    } else {
      handSkeleton.update(null, null, false);
    }

    // Air-drawing tracking pointer in interactive fallback mode
    const synthIndexTip = palmToWorld(syntheticLandmarks[8], 0);
    airDrawing.update(dt, synthIndexTip, true, settings.energy);
  }

  // ── 3. Translucent Blue Smoke & Face-Aware Energy Waves ──
  smoke.update(
    dt,
    orbPos,
    orb.currentIntensity,
    settings.smokeEnabled ? settings.smokeDensity : 0,
    currentSpeed,
    activeHandVel,
    orb.charge,
    currentHandScale,
    faceData // Coordinates for face trajectory & eye clarity masking
  );

  // ── 4. Visual Effect Updates ──
  orb.update(dt, settings.energy, camera);
  particles.update(
    dt,
    performance.now() / 1000,
    orb.currentIntensity,
    settings.particlesEnabled ? settings.particleDensity : 0
  );
  arcs.update(dt, settings.arcsEnabled ? orb.currentIntensity : 0);
  shockwave.update(dt);

  // ── 5. Audio Synthesis Sync ──
  soundFX.update(orb.currentIntensity * settings.energy, orb.charge, currentSpeed);

  // ── 6. Bloom Post-Processing (Composited over transparent live video / anime canvas) ──
  if (bloomPass) {
    bloomPass.enabled = settings.bloomEnabled;
    bloomPass.strength = 1.35 * settings.energy;
    bloomPass.radius = 0.45;
    bloomPass.threshold = 0.18;
  }

  // ── 7. Composite Render ──
  renderer.clear();
  composer.render(dt);
}

// ── Boot ──
init().catch((err) => {
  console.error('Application boot error:', err);
  const el = document.querySelector('.status-msg');
  if (el) el.textContent = `ERROR: ${err.message}`;
});
