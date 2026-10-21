/**
 * main.js – Application entry point
 *
 * Ties together camera, hand tracking, gestures, 3D rendering,
 * orb effects, and the UI.
 */

import * as THREE from 'three';
import { startCamera, stopCamera, isCameraReady, getVideo } from './camera.js';
import { initHandTracking, detectHands, isTrackingReady } from './handTracking.js';
import { processGestures, isTwoHandOpen, twoHandMidpoint, twoHandDistance } from './gestures.js';
import { EnergyOrb } from './orb.js';
import { OrbParticles } from './particles.js';
import { OrbSmoke } from './smoke.js';
import { createPostProcessing, ElectricalArcs } from './effects.js';
import {
  initUI, showApp, setLoadingText, setCameraStatus, setTrackingStatus,
  setGestureDisplay, setStarted, setStopped, getSettings, setupScreenshot,
} from './ui.js';

// ── State ──
let renderer, scene, camera, composer, bloomPass;
let orb, particles, smoke, arcs;
let running = false;
let demoMode = false;
let lastTime = 0;
let animFrameId = null;
let mousePos = { x: 0.5, y: 0.5 };

// ── Initialise ──

async function init() {
  initUI({
    onStart: handleStart,
    onStop: handleStop,
    onDemo: handleDemo,
    onReset: handleReset,
  });

  setLoadingText('Initialising renderer…');

  // Three.js setup
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true, // for screenshots
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 2;

  // Ambient light
  scene.add(new THREE.AmbientLight(0x112244, 0.3));

  // Create orb components
  orb = new EnergyOrb();
  scene.add(orb.group);

  particles = new OrbParticles();
  scene.add(particles.group);

  smoke = new OrbSmoke();
  scene.add(smoke.group);

  arcs = new ElectricalArcs();
  scene.add(arcs.group);

  // Post-processing
  const pp = createPostProcessing(renderer, scene, camera, window.innerWidth, window.innerHeight);
  composer = pp.composer;
  bloomPass = pp.bloomPass;

  // Screenshot
  setupScreenshot(renderer);

  // Resize handler
  window.addEventListener('resize', onResize);

  // Mouse fallback for demo mode
  window.addEventListener('mousemove', (e) => {
    mousePos.x = e.clientX / window.innerWidth;
    mousePos.y = e.clientY / window.innerHeight;
  });

  // Load hand tracking model
  setLoadingText('Downloading hand tracking model…');
  try {
    await initHandTracking((msg) => setLoadingText(msg));
    setLoadingText('Ready!');
  } catch (err) {
    console.warn('Hand tracking init failed:', err);
    setLoadingText('Hand tracking unavailable – use Demo Mode');
  }

  showApp();

  // Start render loop
  lastTime = performance.now();
  animate(performance.now());
}

// ── Handlers ──

async function handleStart() {
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
    alert('Camera access denied or not available.\nUse Demo Mode instead.');
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
}

function handleDemo() {
  demoMode = true;
  running = true;
  setCameraStatus(false);
  setTrackingStatus(true);
  setGestureDisplay('open');
  setStarted();
  orb.show();
}

function handleReset() {
  orb.hide();
  orb.setCharge(0);
  orb.setScale(1);
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

// ── Map normalised palm coords to 3D world position ──
// palm.x: 0..1 (left-right), palm.y: 0..1 (top-bottom)
// The camera is mirrored, so we flip x

function palmToWorld(palm) {
  // Map from normalised video coords to NDC
  // Mirrored camera: x is already flipped in the video CSS,
  // but MediaPipe gives un-mirrored coords, so we mirror here
  const ndcX = (1 - palm.x) * 2 - 1;  // mirror X
  const ndcY = -(palm.y * 2 - 1);      // flip Y (top = +1)

  // Project into world space at a fixed depth
  const worldX = ndcX * camera.aspect * 0.8;
  const worldY = ndcY * 0.8;

  // Offset upward slightly so the orb appears above the palm
  return { x: worldX, y: worldY + 0.15, z: 0 };
}

// ── Animation loop ──

function animate(now) {
  animFrameId = requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  const settings = getSettings();

  // ── Hand tracking ──
  let hands = null;
  if (running && !demoMode && isCameraReady() && isTrackingReady()) {
    const video = getVideo();
    const results = detectHands(video, now);
    hands = processGestures(results, dt);

    // Check if any hand is present
    const anyPresent = hands.some((h) => h.present);
    setTrackingStatus(anyPresent);

    if (anyPresent) {
      const primary = hands.find((h) => h.present);
      setGestureDisplay(primary.gesture);

      // Two-hand mode
      if (isTwoHandOpen(hands)) {
        const mid = twoHandMidpoint(hands);
        const dist = twoHandDistance(hands);
        const world = palmToWorld(mid);
        const megaScale = Math.min(dist * 5, 3) * settings.orbSize;

        orb.show();
        orb.setScale(megaScale);
        orb.setCharge(0.5);
        orb.setPosition(world.x, world.y, world.z);
        particles.setPosition(world.x, world.y, world.z);
        smoke.setPosition(world.x, world.y, world.z);
        arcs.setPosition(world.x, world.y, world.z);
      } else {
        // Single hand
        const world = palmToWorld(primary.palm);

        if (primary.gesture === 'open') {
          orb.show();
          orb.setCharge(0);
          orb.setScale(settings.orbSize);
        } else if (primary.gesture === 'fist') {
          orb.show();
          orb.setCharge(1);
          orb.setScale(settings.orbSize * 0.6);
        } else if (primary.gesture === 'pinch') {
          orb.show();
          orb.setCharge(0.3);
          orb.setScale(settings.orbSize * primary.pinchDist * 3);
        } else {
          orb.hide();
        }

        orb.setPosition(world.x, world.y, world.z);
        particles.setPosition(world.x, world.y, world.z);
        smoke.setPosition(world.x, world.y, world.z);
        arcs.setPosition(world.x, world.y, world.z);

        // Speed-based effects
        smoke.update(dt, orb.currentIntensity, settings.smokeEnabled ? settings.smokeDensity : 0, primary.speed, orb.charge);
      }
    } else {
      // No hand tracked
      setGestureDisplay('none');
      orb.hide();
    }
  }

  // ── Demo mode: follow mouse ──
  if (demoMode) {
    const world = palmToWorld(mousePos);
    orb.show();
    orb.setScale(settings.orbSize);
    orb.setCharge(0);
    orb.setPosition(world.x, world.y, world.z);
    particles.setPosition(world.x, world.y, world.z);
    smoke.setPosition(world.x, world.y, world.z);
    arcs.setPosition(world.x, world.y, world.z);
    smoke.update(dt, 1, settings.smokeEnabled ? settings.smokeDensity : 0, 0.1, 0);
  }

  // ── Update smoke for non-single-hand scenarios ──
  if (!demoMode && hands) {
    // Smoke was already updated in the single-hand branch if a hand was present
    const anyPresent = hands.some((h) => h.present);
    if (!anyPresent) {
      smoke.update(dt, 0, settings.smokeEnabled ? settings.smokeDensity : 0, 0, 0);
    } else if (isTwoHandOpen(hands)) {
      const primary = hands.find((h) => h.present);
      smoke.update(dt, orb.currentIntensity, settings.smokeEnabled ? settings.smokeDensity : 0, primary ? primary.speed : 0, orb.charge);
    }
  }

  // ── Update orb and effects ──
  orb.update(dt, settings.energy);
  particles.update(dt, performance.now() / 1000, orb.currentIntensity, settings.particlesEnabled ? settings.particleDensity : 0);
  arcs.update(dt, settings.arcsEnabled ? orb.currentIntensity : 0);

  // ── Bloom settings ──
  if (bloomPass) {
    bloomPass.enabled = settings.bloomEnabled;
    bloomPass.strength = 1.2 * settings.energy;
  }

  // ── Render ──
  renderer.clear();
  composer.render(dt);
}

// ── Boot ──
init().catch((err) => {
  console.error('Fatal init error:', err);
  const el = document.querySelector('.loader-subtitle');
  if (el) el.textContent = `Error: ${err.message}`;
});
