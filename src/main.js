/**
 * main.js – Application entry point
 *
 * Exact reference recreation of the anime hand energy VFX.
 * Ties together real-time camera tracking, precision perspective mapping,
 * blue-white luminous energy orb with plasma distortion,
 * organic orange/amber energy filaments wrapping around the fingers,
 * curling blue smoke and expanding energy waves, sparks, and procedural audio.
 */

import * as THREE from 'three';
import { startCamera, stopCamera, isCameraReady, getVideo } from './camera.js';
import { initHandTracking, detectHands, isTrackingReady } from './handTracking.js';
import { processGestures, isTwoHandOpen, twoHandMidpoint, twoHandDistance } from './gestures.js';
import { EnergyOrb } from './orb.js';
import { OrangeFilaments } from './orangeFilaments.js';
import { OrbParticles } from './particles.js';
import { OrbSmoke } from './smoke.js';
import { createPostProcessing, ElectricalArcs, ShockwaveRing } from './effects.js';
import { HandSkeleton } from './handSkeleton.js';
import { soundFX } from './audio.js';
import {
  initUI, showApp, setLoadingText, setCameraStatus, setTrackingStatus,
  setGestureDisplay, setStarted, setStopped, getSettings, setupScreenshot,
} from './ui.js';

// ── State ──
let renderer, scene, camera, composer, bloomPass;
let orb, orangeFilaments, particles, smoke, arcs, shockwave, handSkeleton;
let running = false;
let demoMode = false;
let lastTime = 0;
let animFrameId = null;
let mousePos = { x: 0.5, y: 0.5 };
let demoGestureIndex = 0;
const DEMO_GESTURES = ['open', 'fist', 'pinch'];
let prevGesture = 'none';

// ── Initialise ──

async function init() {
  initUI({
    onStart: handleStart,
    onStop: handleStop,
    onDemo: handleDemo,
    onReset: handleReset,
    onSoundToggle: () => soundFX.toggle(),
  });

  setLoadingText('Initialising 3D VFX renderer…');

  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 2;

  scene.add(new THREE.AmbientLight(0x112244, 0.3));

  // 1. Blue-White Luminous Energy Orb
  orb = new EnergyOrb();
  scene.add(orb.group);

  // 2. Orange & Amber Energy Filaments wrapping around fingers & palm
  orangeFilaments = new OrangeFilaments();
  scene.add(orangeFilaments.group);

  // 3. Fine Sparks & Floating Particles
  particles = new OrbParticles();
  scene.add(particles.group);

  // 4. Curling Blue Smoke & Expanding Energy Waves
  smoke = new OrbSmoke();
  scene.add(smoke.group);

  // 5. Electrical Arcs
  arcs = new ElectricalArcs();
  scene.add(arcs.group);

  // 6. Shockwave Ring VFX
  shockwave = new ShockwaveRing();
  scene.add(shockwave.group);

  // 7. Hand Energy Stream (Knuckle-joint lines)
  handSkeleton = new HandSkeleton();
  scene.add(handSkeleton.group);

  // 8. Post-Processing Pipeline
  const pp = createPostProcessing(renderer, scene, camera, window.innerWidth, window.innerHeight);
  composer = pp.composer;
  bloomPass = pp.bloomPass;

  setupScreenshot(renderer);
  window.addEventListener('resize', onResize);
  setupInteractionEvents();

  setLoadingText('Loading MediaPipe Hand Landmarker…');
  try {
    await initHandTracking((msg) => setLoadingText(msg));
    setLoadingText('Ready!');
  } catch (err) {
    console.warn('Hand tracking init error, defaulting to Demo Mode:', err);
    setLoadingText('Camera unavailable – use Demo Mode');
  }

  showApp();

  lastTime = performance.now();
  animate(performance.now());
}

// ── Interaction Events ──

function setupInteractionEvents() {
  window.addEventListener('mousemove', (e) => {
    mousePos.x = e.clientX / window.innerWidth;
    mousePos.y = e.clientY / window.innerHeight;
  });

  // Demo mode click to cycle gesture
  window.addEventListener('click', (e) => {
    soundFX.init();
    soundFX.resume();

    if (e.target.closest('#side-panel, #top-bar, #bottom-bar')) return;

    if (demoMode) {
      demoGestureIndex = (demoGestureIndex + 1) % DEMO_GESTURES.length;
      const g = DEMO_GESTURES[demoGestureIndex];
      setGestureDisplay(g);
      if (g === 'open' && prevGesture === 'fist') {
        soundFX.playBurst(1.2);
        const w = palmToWorld(mousePos, 0.12);
        shockwave.trigger(w.x, w.y, w.z, getSettings().orbSize);
      }
      prevGesture = g;
    }
  });

  window.addEventListener('wheel', (e) => {
    const slider = document.getElementById('slider-orb-size');
    if (!slider) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newVal = Math.min(Math.max(parseFloat(slider.value) + delta, 0.2), 3);
    slider.value = newVal;
    getSettings().orbSize = newVal;
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (running) handleStop();
      else handleStart();
    } else if (e.code === 'KeyM') {
      const btn = document.getElementById('btn-sound');
      const state = soundFX.toggle();
      if (btn) btn.textContent = state ? '🔊' : '🔇';
    } else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    } else if (e.code === 'KeyR') {
      handleReset();
    }
  });
}

// ── Handlers ──

async function handleStart() {
  soundFX.init();
  soundFX.resume();
  demoMode = false;
  const video = document.getElementById('camera-feed');
  try {
    await startCamera(video);
    setCameraStatus(true);
    setStarted();
    running = true;
  } catch (err) {
    console.error('Camera access error:', err);
    setCameraStatus(false);
    alert('Webcam access was denied or is unavailable.\nOpening Demo Mode instead.');
    handleDemo();
  }
}

function handleStop() {
  running = false;
  demoMode = false;
  stopCamera();
  setCameraStatus(false);
  setTrackingStatus(false);
  setGestureDisplay('none');
  setStopped();
  orb.hide();
  orangeFilaments.hide();
  soundFX.update(0, 0, 0);
}

function handleDemo() {
  soundFX.init();
  soundFX.resume();
  demoMode = true;
  running = true;
  setCameraStatus(false);
  setTrackingStatus(true);
  demoGestureIndex = 0;
  setGestureDisplay(DEMO_GESTURES[demoGestureIndex]);
  setStarted();
  orb.show();
  orangeFilaments.show();
}

function handleReset() {
  orb.hide();
  orangeFilaments.hide();
  orb.setCharge(0);
  orb.setScale(1);
  soundFX.update(0, 0, 0);
}

// ── Resize ──

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
}

// ── Precision Mapping from Video Coordinates to 3D World ──

function palmToWorld(pt, offsetUp = 0.12) {
  let screenX = 1 - pt.x; // Mirrored video feed
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

  // Normalized Device Coordinates (-1 to +1)
  const ndcX = screenX * 2 - 1;
  const ndcY = -(screenY * 2 - 1);

  // Perspective frustum dimensions at z=0 plane
  const fovRad = (camera.fov * Math.PI) / 180;
  const halfHeight = Math.tan(fovRad / 2) * camera.position.z;
  const halfWidth = halfHeight * camera.aspect;

  const worldX = ndcX * halfWidth;
  const worldY = ndcY * halfHeight + offsetUp;
  const worldZ = pt.z ? -pt.z * 1.5 : 0;

  return { x: worldX, y: worldY, z: worldZ };
}

// ── Synthetic Demo Landmarks Generator ──

function generateDemoLandmarks(pt, gesture) {
  const lm = [];
  const cx = 1 - pt.x; // Un-mirror for mapping
  const cy = pt.y;

  // 0: Wrist
  lm.push({ x: cx, y: cy + 0.12, z: 0 });

  // Finger configs: [baseOffsetX, tipOffsetY, curlFactor]
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

// ── Animation Loop ──

function animate(now) {
  animFrameId = requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  const settings = getSettings();
  let currentSpeed = 0;
  let activeHandVel = { x: 0, y: 0 };
  let orbPos = { x: 0, y: 0, z: 0 };
  let currentHandScale = 1.0;

  // ── 1. Live Hand Tracking Mode ──
  let hands = null;
  if (running && !demoMode && isCameraReady() && isTrackingReady()) {
    const video = getVideo();
    const results = detectHands(video, now);
    hands = processGestures(results, dt);

    const anyPresent = hands.some((h) => h.present);
    setTrackingStatus(anyPresent);

    if (anyPresent) {
      const primary = hands.find((h) => h.present);
      setGestureDisplay(primary.gesture);
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

      // Two-Hand Mode
      if (isTwoHandOpen(hands)) {
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
        // Position orb floating just above the center of the open palm
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

        // Orange Energy Filaments wrapping around fingers & palm
        if (settings.filamentsEnabled) {
          orangeFilaments.show();
          orangeFilaments.update(dt, primary.landmarks, (lm) => palmToWorld(lm, 0), currentHandScale);
        } else {
          orangeFilaments.hide();
        }
      }

      // Hand skeleton joint lines
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
      prevGesture = 'none';
    }
  }

  // ── 2. Demo Mode (Mouse Simulation) ──
  if (demoMode) {
    currentHandScale = 1.0;
    const activeGesture = DEMO_GESTURES[demoGestureIndex];
    orbPos = palmToWorld(mousePos, 0.14);

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

    // Generate virtual hand landmarks for Demo Mode so orange filaments wrap around fingers
    const demoLandmarks = generateDemoLandmarks(mousePos, activeGesture);
    if (settings.filamentsEnabled) {
      orangeFilaments.show();
      orangeFilaments.update(dt, demoLandmarks, (lm) => palmToWorld(lm, 0), 1.0);
    } else {
      orangeFilaments.hide();
    }

    if (settings.skeletonEnabled) {
      handSkeleton.update(demoLandmarks, (lm) => palmToWorld(lm, 0), orb.currentIntensity > 0.05, settings.energy);
    } else {
      handSkeleton.update(null, null, false);
    }
  }

  // ── 3. Smoke Simulation (Local Curling Wisps & Expanding Scene Waves) ──
  smoke.update(
    dt,
    orbPos,
    orb.currentIntensity,
    settings.smokeEnabled ? settings.smokeDensity : 0,
    currentSpeed,
    activeHandVel,
    orb.charge,
    currentHandScale
  );

  // ── 4. Update 3D Components ──
  orb.update(dt, settings.energy, camera);
  particles.update(
    dt,
    performance.now() / 1000,
    orb.currentIntensity,
    settings.particlesEnabled ? settings.particleDensity : 0
  );
  arcs.update(dt, settings.arcsEnabled ? orb.currentIntensity : 0);
  shockwave.update(dt);

  // ── 5. Audio Synthesis ──
  soundFX.update(orb.currentIntensity * settings.energy, orb.charge, currentSpeed);

  // ── 6. Bloom Post-Processing ──
  if (bloomPass) {
    bloomPass.enabled = settings.bloomEnabled;
    bloomPass.strength = 1.35 * settings.energy;
    bloomPass.radius = 0.45;
    bloomPass.threshold = 0.18;
  }

  // ── 7. Render Pass ──
  renderer.clear();
  composer.render(dt);
}

// ── Boot ──
init().catch((err) => {
  console.error('Fatal initialization error:', err);
  const el = document.querySelector('.loader-subtitle');
  if (el) el.textContent = `Error: ${err.message}`;
});
