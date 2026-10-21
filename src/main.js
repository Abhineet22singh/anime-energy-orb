/**
 * main.js – Clean Webcam Anime Energy Orb
 *
 * Simple structure:
 * 1. Open webcam (mirrored)
 * 2. Track hand with MediaPipe
 * 3. Render glowing blue energy orb on the palm with Three.js
 * 4. Smooth tracking + pulsing bloom glow
 */

import * as THREE from 'three';
import { startCamera, isCameraReady, getVideo } from './camera.js';
import { initVisionTracking, detectVision, isTrackingReady } from './handTracking.js';
import { processGestures, isTwoHandOpen, twoHandMidpoint, twoHandDistance } from './gestures.js';
import { EnergyOrb } from './orb.js';
import { OrangeFilaments } from './orangeFilaments.js';
import { OrbParticles } from './particles.js';
import { OrbSmoke } from './smoke.js';
import { createPostProcessing, ElectricalArcs, ShockwaveRing } from './effects.js';
import { HandSkeleton } from './handSkeleton.js';
import { soundFX } from './audio.js';

// ── State ──
let renderer, scene, camera, composer, bloomPass;
let orb, orangeFilaments, particles, smoke, arcs, shockwave, handSkeleton;
let running = false;
let interactiveMode = false;
let lastTime = 0;
let pointerPos = { x: 0.5, y: 0.5 };
let interactiveGestureIndex = 0;
const GESTURES = ['open', 'fist', 'pinch'];
let prevGesture = 'none';
let hintDismissed = false;

// ── DOM ──
const $ = (id) => document.getElementById(id);

// ── Init ──
async function init() {
  // Three.js — transparent overlay on top of live webcam
  const canvas = $('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 2;
  scene.add(new THREE.AmbientLight(0x0c1b33, 0.35));

  // VFX nodes
  orb = new EnergyOrb();
  scene.add(orb.group);

  orangeFilaments = new OrangeFilaments();
  scene.add(orangeFilaments.group);

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

  // Post-processing (bloom glow)
  const pp = createPostProcessing(renderer, scene, camera, window.innerWidth, window.innerHeight);
  composer = pp.composer;
  bloomPass = pp.bloomPass;

  // Screenshot
  $('btn-capture')?.addEventListener('click', takeScreenshot);

  // Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (bloomPass) bloomPass.resolution.set(w, h);
  });

  // Mouse/touch fallback
  window.addEventListener('mousemove', (e) => {
    pointerPos.x = e.clientX / window.innerWidth;
    pointerPos.y = e.clientY / window.innerHeight;
  });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length) {
      pointerPos.x = e.touches[0].clientX / window.innerWidth;
      pointerPos.y = e.touches[0].clientY / window.innerHeight;
    }
  }, { passive: true });

  window.addEventListener('click', (e) => {
    if (e.target.closest('#btn-capture')) return;
    soundFX.init(); soundFX.resume();
    if (interactiveMode) {
      interactiveGestureIndex = (interactiveGestureIndex + 1) % GESTURES.length;
      const g = GESTURES[interactiveGestureIndex];
      setGestureBadge(g);
      if (g === 'open' && prevGesture === 'fist') {
        soundFX.playBurst(1.2);
        const w = toWorld(pointerPos, 0.12);
        shockwave.trigger(w.x, w.y, w.z, 1.0);
      }
      prevGesture = g;
    }
  });

  // Mouse-wheel orb scale (interactive mode nicety)
  window.addEventListener('wheel', () => {}, { passive: true });

  // Load AI vision
  setStatus('LOADING AI HAND TRACKING…');
  try {
    await initVisionTracking((msg) => setStatus(msg.toUpperCase()));
    $('loader')?.classList.add('hidden');
    $('btn-start')?.classList.remove('hidden');
  } catch (err) {
    console.warn('Vision init error:', err);
    $('loader')?.classList.add('hidden');
    $('btn-start')?.classList.remove('hidden');
  }

  // Start button
  $('btn-start')?.addEventListener('click', startExperience);

  // Boot loop
  lastTime = performance.now();
  animate(performance.now());
}

function setStatus(msg) {
  const el = $('status-msg');
  if (el) el.textContent = msg;
}

function setGestureBadge(gesture) {
  const badge = $('gesture-badge');
  const icon = $('gesture-icon');
  const label = $('gesture-label');
  if (!badge) return;

  const map = {
    open:  { i: '🖐', l: 'OPEN PALM',   c: '' },
    fist:  { i: '✊', l: 'CHARGING',    c: 'fist' },
    pinch: { i: '🤏', l: 'PINCH SCALE', c: 'pinch' },
    none:  { i: '👁️', l: 'SEARCHING…',  c: '' },
  };
  const g = map[gesture] || map.none;
  badge.className = `badge ${g.c}`;
  if (icon) icon.textContent = g.i;
  if (label) label.textContent = g.l;

  if (gesture !== 'none' && !hintDismissed) {
    hintDismissed = true;
    $('hint')?.classList.add('fade');
  }
}

async function startExperience() {
  soundFX.init(); soundFX.resume(); soundFX.playBurst(0.7);

  // Transition
  const splash = $('splash');
  if (splash) {
    splash.style.transition = 'opacity .5s ease';
    splash.style.opacity = '0';
    setTimeout(() => splash.classList.add('hidden'), 500);
  }
  $('app')?.classList.remove('hidden');

  // Camera
  const video = $('camera-feed');
  try {
    await startCamera(video);
    running = true;
    interactiveMode = false;
  } catch (err) {
    console.warn('No camera — interactive mouse mode:', err);
    running = true;
    interactiveMode = true;
    orb.show();
    orangeFilaments.show();
    setGestureBadge('open');
  }
}

// ── Coordinate Mapping ──
function toWorld(pt, offsetUp = 0.12) {
  let sx = 1 - pt.x, sy = pt.y;

  const video = getVideo();
  if (video && video.videoWidth && video.videoHeight) {
    const va = video.videoWidth / video.videoHeight;
    const wa = window.innerWidth / window.innerHeight;
    if (wa > va) {
      const rh = window.innerWidth / va;
      const crop = (rh - window.innerHeight) / 2;
      sy = (pt.y * rh - crop) / window.innerHeight;
    } else {
      const rw = window.innerHeight * va;
      const crop = (rw - window.innerWidth) / 2;
      sx = ((1 - pt.x) * rw - crop) / window.innerWidth;
    }
  }

  const ndcX = sx * 2 - 1, ndcY = -(sy * 2 - 1);
  const fov = (camera.fov * Math.PI) / 180;
  const hH = Math.tan(fov / 2) * camera.position.z;
  const hW = hH * camera.aspect;

  return { x: ndcX * hW, y: ndcY * hH + offsetUp, z: pt.z ? -pt.z * 1.5 : 0 };
}

function syntheticLandmarks(pt, gesture) {
  const lm = [];
  const cx = 1 - pt.x, cy = pt.y;
  lm.push({ x: cx, y: cy + 0.12, z: 0 });
  const fingers = [
    { b: [-0.06, 0.04], t: [-0.10, -0.04], c: gesture === 'fist' ? 0.35 : 1 },
    { b: [-0.03, -0.01], t: [-0.04, -0.12], c: gesture === 'fist' ? 0.25 : 1 },
    { b: [0, -0.02], t: [0, -0.14], c: gesture === 'fist' ? 0.22 : 1 },
    { b: [0.03, -0.01], t: [0.03, -0.12], c: gesture === 'fist' ? 0.25 : 1 },
    { b: [0.05, 0.02], t: [0.07, -0.09], c: gesture === 'fist' ? 0.30 : 1 },
  ];
  if (gesture === 'pinch') { fingers[0].t = [-0.02, -0.04]; fingers[1].t = [-0.02, -0.04]; }
  for (const { b, t, c } of fingers) {
    for (let j = 1; j <= 4; j++) {
      const r = (j / 4) * c;
      lm.push({ x: cx + b[0] + (t[0] - b[0]) * r, y: cy + b[1] + (t[1] - b[1]) * r, z: 0 });
    }
  }
  return lm;
}

// ── Screenshot ──
function takeScreenshot() {
  const video = $('camera-feed');
  const tc = renderer.domElement;
  const w = tc.width, h = tc.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  if (video && video.readyState >= 2) {
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
    const va = video.videoWidth / video.videoHeight, ca = w / h;
    let dw, dh, dx, dy;
    if (ca > va) { dw = w; dh = w / va; dx = 0; dy = (h - dh) / 2; }
    else { dh = h; dw = h * va; dx = (w - dw) / 2; dy = 0; }
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.restore();
  }
  ctx.drawImage(tc, 0, 0, w, h);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `energy-orb-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

// ── Animation Loop ──
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  let speed = 0, vel = { x: 0, y: 0 }, orbPos = { x: 0, y: 0, z: 0 }, hs = 1, faceData = null;

  // ── Hand Tracking ──
  if (running && !interactiveMode && isCameraReady() && isTrackingReady()) {
    const video = getVideo();
    const vision = detectVision(video, now);

    // Face data for smoke trajectory
    if (vision.face?.faceLandmarks?.length > 0) {
      const fl = vision.face.faceLandmarks[0];
      faceData = {
        leftEye: toWorld(fl[33], 0),
        rightEye: toWorld(fl[263], 0),
        faceCenter: toWorld(fl[4], 0),
      };
    }

    const hands = processGestures(vision.hands, dt);
    const active = hands.find((h) => h.present);

    if (active) {
      speed = active.speed;
      vel = active.velocity;
      hs = active.handScale || 1;

      if (prevGesture === 'fist' && active.gesture === 'open') {
        const bp = toWorld(active.palm, 0.12 * hs);
        shockwave.trigger(bp.x, bp.y, bp.z, hs * 1.5);
        soundFX.playBurst(1.3);
      }
      prevGesture = active.gesture;
      setGestureBadge(active.gesture);

      // Two-hand mega orb
      if (isTwoHandOpen(hands)) {
        const mid = twoHandMidpoint(hands);
        const dist = twoHandDistance(hands);
        orbPos = toWorld(mid, 0.08 * hs);
        const ms = Math.min(Math.max(dist * 4.2, 0.7), 2.8) * hs;
        orb.show(); orb.setScale(ms); orb.setCharge(0.4);
      } else {
        orbPos = toWorld(active.palm, 0.14 * hs);
        if (active.gesture === 'open') { orb.show(); orb.setCharge(0); orb.setScale(hs); }
        else if (active.gesture === 'fist') { orb.show(); orb.setCharge(1); orb.setScale(hs * 0.55); }
        else if (active.gesture === 'pinch') {
          orb.show(); orb.setCharge(0.3);
          orb.setScale(hs * Math.min(Math.max(active.pinchDist * 2.8, 0.3), 2.5));
        } else { orb.hide(); }
      }

      orb.setPosition(orbPos.x, orbPos.y, orbPos.z);
      particles.setPosition(orbPos.x, orbPos.y, orbPos.z);
      arcs.setPosition(orbPos.x, orbPos.y, orbPos.z);

      orangeFilaments.show();
      orangeFilaments.update(dt, active.landmarks, (lm) => toWorld(lm, 0), hs);
      handSkeleton.update(active.landmarks, (lm) => toWorld(lm, 0), orb.currentIntensity > 0.05, 1);
    } else {
      setGestureBadge('none');
      orb.hide(); orangeFilaments.hide();
      handSkeleton.update(null, null, false);
      prevGesture = 'none';
    }
  }

  // ── Interactive fallback ──
  if (interactiveMode && running) {
    const g = GESTURES[interactiveGestureIndex];
    orbPos = toWorld(pointerPos, 0.14);
    if (g === 'open')  { orb.show(); orb.setCharge(0); orb.setScale(1); }
    if (g === 'fist')  { orb.show(); orb.setCharge(1); orb.setScale(0.55); }
    if (g === 'pinch') { orb.show(); orb.setCharge(0.3); orb.setScale(0.45); }
    orb.setPosition(orbPos.x, orbPos.y, orbPos.z);
    particles.setPosition(orbPos.x, orbPos.y, orbPos.z);
    arcs.setPosition(orbPos.x, orbPos.y, orbPos.z);
    const sl = syntheticLandmarks(pointerPos, g);
    orangeFilaments.show();
    orangeFilaments.update(dt, sl, (lm) => toWorld(lm, 0), 1);
    handSkeleton.update(sl, (lm) => toWorld(lm, 0), orb.currentIntensity > 0.05, 1);
  }

  // ── Effects ──
  smoke.update(dt, orbPos, orb.currentIntensity, 1, speed, vel, orb.charge, hs, faceData);
  orb.update(dt, 1, camera);
  particles.update(dt, performance.now() / 1000, orb.currentIntensity, 1);
  arcs.update(dt, orb.currentIntensity);
  shockwave.update(dt);
  soundFX.update(orb.currentIntensity, orb.charge, speed);

  if (bloomPass) {
    bloomPass.enabled = true;
    bloomPass.strength = 1.35;
    bloomPass.radius = 0.45;
    bloomPass.threshold = 0.18;
  }

  renderer.clear();
  composer.render(dt);
}

// ── Boot ──
init().catch((err) => {
  console.error('Boot error:', err);
  const el = $('status-msg');
  if (el) el.textContent = `ERROR: ${err.message}`;
});
