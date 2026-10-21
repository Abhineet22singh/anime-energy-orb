/**
 * main.js – Application entry point
 *
 * Ties together camera, hand tracking, gestures, 3D rendering,
 * procedural GLSL shaders, audio synthesis, and visual effects.
 */

import * as THREE from 'three';
import { startCamera, stopCamera, isCameraReady, getVideo } from './camera.js';
import { initHandTracking, detectHands, isTrackingReady } from './handTracking.js';
import { processGestures, isTwoHandOpen, twoHandMidpoint, twoHandDistance } from './gestures.js';
import { EnergyOrb } from './orb.js';
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
let orb, particles, smoke, arcs, shockwave, handSkeleton;
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

  setLoadingText('Initialising 3D renderer…');

  // Three.js setup
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

  // Visual Effect Components
  orb = new EnergyOrb();
  scene.add(orb.group);

  particles = new OrbParticles();
  scene.add(particles.group);

  smoke = new OrbSmoke();
  scene.add(smoke.group);

  arcs = new ElectricalArcs();
  scene.add(arcs.group);

  shockwave = new ShockwaveRing();
  scene.add(shockwave.group);

  handSkeleton = new HandSkeleton();
  scene.add(handSkeleton.group);

  // Post-processing
  const pp = createPostProcessing(renderer, scene, camera, window.innerWidth, window.innerHeight);
  composer = pp.composer;
  bloomPass = pp.bloomPass;

  // Screenshot
  setupScreenshot(renderer);

  // Event Listeners
  window.addEventListener('resize', onResize);
  setupInteractionEvents();

  // Load hand tracking model
  setLoadingText('Downloading MediaPipe hand tracking model…');
  try {
    await initHandTracking((msg) => setLoadingText(msg));
    setLoadingText('Ready!');
  } catch (err) {
    console.warn('Hand tracking init fallback:', err);
    setLoadingText('Hand tracking unavailable – click Demo Mode');
  }

  showApp();

  lastTime = performance.now();
  animate(performance.now());
}

// ── Interaction Events ──

function setupInteractionEvents() {
  // Mouse position
  window.addEventListener('mousemove', (e) => {
    mousePos.x = e.clientX / window.innerWidth;
    mousePos.y = e.clientY / window.innerHeight;
  });

  // Demo mode click to cycle gesture
  window.addEventListener('click', (e) => {
    soundFX.init();
    soundFX.resume();

    // Ignore clicks on control panels
    if (e.target.closest('#side-panel, #top-bar, #bottom-bar')) return;

    if (demoMode) {
      demoGestureIndex = (demoGestureIndex + 1) % DEMO_GESTURES.length;
      const g = DEMO_GESTURES[demoGestureIndex];
      setGestureDisplay(g);
      if (g === 'open' && prevGesture === 'fist') {
        soundFX.playBurst(1.2);
        const w = palmToWorld(mousePos);
        shockwave.trigger(w.x, w.y, w.z, getSettings().orbSize);
      }
      prevGesture = g;
    }
  });

  // Mouse wheel to adjust orb size
  window.addEventListener('wheel', (e) => {
    const slider = document.getElementById('slider-orb-size');
    if (!slider) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newVal = Math.min(Math.max(parseFloat(slider.value) + delta, 0.2), 3);
    slider.value = newVal;
    getSettings().orbSize = newVal;
  }, { passive: true });

  // Keyboard Shortcuts
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
    console.error('Camera error:', err);
    setCameraStatus(false);
    alert('Camera access denied or unavailable.\nSwitching to Demo Mode instead.');
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
}

function handleReset() {
  orb.hide();
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

function palmToWorld(pt, offsetUp = 0.15) {
  let screenX = 1 - pt.x; // Mirrored video
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

  // Perspective frustum dimensions at z=0 plane (distance = camera.position.z = 2)
  const fovRad = (camera.fov * Math.PI) / 180;
  const halfHeight = Math.tan(fovRad / 2) * camera.position.z;
  const halfWidth = halfHeight * camera.aspect;

  const worldX = ndcX * halfWidth;
  const worldY = ndcY * halfHeight + offsetUp;
  const worldZ = pt.z ? -pt.z * 1.5 : 0;

  return { x: worldX, y: worldY, z: worldZ };
}

// ── Animation Loop ──

function animate(now) {
  animFrameId = requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  const settings = getSettings();
  let currentSpeed = 0;

  // ── Hand Tracking Mode ──
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

      // Detect charge burst (fist -> open transition)
      if (prevGesture === 'fist' && primary.gesture === 'open') {
        const world = palmToWorld(primary.palm);
        shockwave.trigger(world.x, world.y, world.z, settings.orbSize * 1.4);
        soundFX.playBurst(1.2);
      }
      prevGesture = primary.gesture;

      // Two-Hand Mega Orb
      if (isTwoHandOpen(hands)) {
        const mid = twoHandMidpoint(hands);
        const dist = twoHandDistance(hands);
        const world = palmToWorld(mid, 0.1);
        const megaScale = Math.min(Math.max(dist * 4.5, 0.8), 3.2) * settings.orbSize;

        orb.show();
        orb.setScale(megaScale);
        orb.setCharge(0.4);
        orb.setPosition(world.x, world.y, world.z);
        particles.setPosition(world.x, world.y, world.z);
        smoke.setPosition(world.x, world.y, world.z);
        arcs.setPosition(world.x, world.y, world.z);
      } else {
        // Single Hand Interaction
        const world = palmToWorld(primary.palm, 0.18);

        if (primary.gesture === 'open') {
          orb.show();
          orb.setCharge(0);
          orb.setScale(settings.orbSize);
        } else if (primary.gesture === 'fist') {
          orb.show();
          orb.setCharge(1.0);
          orb.setScale(settings.orbSize * 0.55);
        } else if (primary.gesture === 'pinch') {
          orb.show();
          orb.setCharge(0.3);
          const pinchScale = Math.min(Math.max(primary.pinchDist * 2.8, 0.3), 2.5);
          orb.setScale(settings.orbSize * pinchScale);
        } else {
          orb.hide();
        }

        orb.setPosition(world.x, world.y, world.z);
        particles.setPosition(world.x, world.y, world.z);
        smoke.setPosition(world.x, world.y, world.z);
        arcs.setPosition(world.x, world.y, world.z);

        smoke.update(
          dt,
          orb.currentIntensity,
          settings.smokeEnabled ? settings.smokeDensity : 0,
          primary.speed,
          orb.charge
        );
      }

      // Hand skeleton visualization
      handSkeleton.enabled = settings.skeletonEnabled;
      handSkeleton.update(
        primary.landmarks,
        (lm) => palmToWorld(lm, 0),
        orb.currentIntensity > 0.05,
        settings.energy
      );
    } else {
      setGestureDisplay('none');
      orb.hide();
      handSkeleton.update(null, null, false);
      prevGesture = 'none';
    }
  }

  // ── Demo Mode (Mouse Simulation) ──
  if (demoMode) {
    const world = palmToWorld(mousePos, 0.15);
    const activeGesture = DEMO_GESTURES[demoGestureIndex];

    if (activeGesture === 'open') {
      orb.show();
      orb.setCharge(0);
      orb.setScale(settings.orbSize);
    } else if (activeGesture === 'fist') {
      orb.show();
      orb.setCharge(1.0);
      orb.setScale(settings.orbSize * 0.55);
    } else if (activeGesture === 'pinch') {
      orb.show();
      orb.setCharge(0.3);
      orb.setScale(settings.orbSize * 0.4);
    }

    orb.setPosition(world.x, world.y, world.z);
    particles.setPosition(world.x, world.y, world.z);
    smoke.setPosition(world.x, world.y, world.z);
    arcs.setPosition(world.x, world.y, world.z);

    smoke.update(
      dt,
      orb.currentIntensity,
      settings.smokeEnabled ? settings.smokeDensity : 0,
      0.15,
      orb.charge
    );
    handSkeleton.update(null, null, false);
  }

  // Update smoke if hands lost or two-hand mode
  if (!demoMode && hands) {
    const anyPresent = hands.some((h) => h.present);
    if (!anyPresent) {
      smoke.update(dt, 0, settings.smokeEnabled ? settings.smokeDensity : 0, 0, 0);
    } else if (isTwoHandOpen(hands)) {
      const primary = hands.find((h) => h.present);
      smoke.update(
        dt,
        orb.currentIntensity,
        settings.smokeEnabled ? settings.smokeDensity : 0,
        primary ? primary.speed : 0,
        orb.charge
      );
    }
  }

  // ── Update 3D Components ──
  orb.update(dt, settings.energy);
  particles.update(
    dt,
    performance.now() / 1000,
    orb.currentIntensity,
    settings.particlesEnabled ? settings.particleDensity : 0
  );
  arcs.update(dt, settings.arcsEnabled ? orb.currentIntensity : 0);
  shockwave.update(dt);

  // Audio synthesis sync
  soundFX.update(orb.currentIntensity * settings.energy, orb.charge, currentSpeed);

  // Bloom post-processing
  if (bloomPass) {
    bloomPass.enabled = settings.bloomEnabled;
    bloomPass.strength = 1.25 * settings.energy;
  }

  // ── Render ──
  renderer.clear();
  composer.render(dt);
}

// ── Boot ──
init().catch((err) => {
  console.error('Fatal initialization error:', err);
  const el = document.querySelector('.loader-subtitle');
  if (el) el.textContent = `Error: ${err.message}`;
});
