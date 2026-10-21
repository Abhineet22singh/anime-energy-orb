/**
 * ui.js – Interface bindings and state management
 */

/** @type {Object<string, HTMLElement>} */
const els = {};

let settings = {
  orbSize: 1,
  energy: 1,
  smokeDensity: 1,
  particleDensity: 1,
  bloomEnabled: true,
  smokeEnabled: true,
  particlesEnabled: true,
  arcsEnabled: true,
  filamentsEnabled: true,
  skeletonEnabled: true,
  soundEnabled: true,
};

let onStart = null;
let onStop = null;
let onDemo = null;
let onReset = null;
let onSoundToggle = null;

/**
 * Initialise all UI elements and bind events.
 */
export function initUI(callbacks) {
  onStart = callbacks.onStart;
  onStop = callbacks.onStop;
  onDemo = callbacks.onDemo;
  onReset = callbacks.onReset;
  onSoundToggle = callbacks.onSoundToggle;

  // Cache elements
  els.loadingScreen = document.getElementById('loading-screen');
  els.app = document.getElementById('app');
  els.statusCamera = document.getElementById('status-camera');
  els.statusTracking = document.getElementById('status-tracking');
  els.statusGesture = document.getElementById('status-gesture');
  els.btnStart = document.getElementById('btn-start');
  els.btnStop = document.getElementById('btn-stop');
  els.btnDemo = document.getElementById('btn-demo');
  els.btnReset = document.getElementById('btn-reset');
  els.btnSound = document.getElementById('btn-sound');
  els.btnScreenshot = document.getElementById('btn-screenshot');
  els.btnFullscreen = document.getElementById('btn-fullscreen');
  els.sidePanel = document.getElementById('side-panel');
  els.btnPanelToggle = document.getElementById('btn-panel-toggle');
  els.sliderOrbSize = document.getElementById('slider-orb-size');
  els.sliderEnergy = document.getElementById('slider-energy');
  els.sliderSmoke = document.getElementById('slider-smoke');
  els.sliderParticles = document.getElementById('slider-particles');
  els.toggleBloom = document.getElementById('toggle-bloom');
  els.toggleSmoke = document.getElementById('toggle-smoke');
  els.toggleParticles = document.getElementById('toggle-particles');
  els.toggleArcs = document.getElementById('toggle-arcs');
  els.toggleFilaments = document.getElementById('toggle-filaments');
  els.toggleSkeleton = document.getElementById('toggle-skeleton');

  // Sound button
  els.btnSound?.addEventListener('click', () => {
    if (onSoundToggle) {
      const state = onSoundToggle();
      els.btnSound.textContent = state ? '🔊' : '🔇';
    }
  });

  // Filaments toggle
  els.toggleFilaments?.addEventListener('change', (e) => {
    settings.filamentsEnabled = e.target.checked;
  });

  // Skeleton toggle
  els.toggleSkeleton?.addEventListener('change', (e) => {
    settings.skeletonEnabled = e.target.checked;
  });

  // Button events
  els.btnStart.addEventListener('click', () => {
    if (onStart) onStart();
  });
  els.btnStop.addEventListener('click', () => {
    if (onStop) onStop();
  });
  els.btnDemo.addEventListener('click', () => {
    if (onDemo) onDemo();
  });
  els.btnReset.addEventListener('click', () => {
    if (onReset) onReset();
  });

  // Fullscreen
  els.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  // Panel toggle
  els.btnPanelToggle.addEventListener('click', () => {
    els.sidePanel.classList.toggle('collapsed');
  });

  // Sliders
  els.sliderOrbSize.addEventListener('input', (e) => {
    settings.orbSize = parseFloat(e.target.value);
  });
  els.sliderEnergy.addEventListener('input', (e) => {
    settings.energy = parseFloat(e.target.value);
  });
  els.sliderSmoke.addEventListener('input', (e) => {
    settings.smokeDensity = parseFloat(e.target.value);
  });
  els.sliderParticles.addEventListener('input', (e) => {
    settings.particleDensity = parseFloat(e.target.value);
  });

  // Toggles
  els.toggleBloom.addEventListener('change', (e) => {
    settings.bloomEnabled = e.target.checked;
  });
  els.toggleSmoke.addEventListener('change', (e) => {
    settings.smokeEnabled = e.target.checked;
  });
  els.toggleParticles.addEventListener('change', (e) => {
    settings.particlesEnabled = e.target.checked;
  });
  els.toggleArcs.addEventListener('change', (e) => {
    settings.arcsEnabled = e.target.checked;
  });
}

/**
 * Get current settings.
 */
export function getSettings() {
  return settings;
}

/**
 * Hide loading screen and show app.
 */
export function showApp() {
  els.loadingScreen.classList.add('hidden');
  els.app.classList.remove('hidden');
}

/**
 * Update loading subtitle text.
 */
export function setLoadingText(text) {
  const sub = els.loadingScreen?.querySelector('.loader-subtitle');
  if (sub) sub.textContent = text;
}

/**
 * Update status pills.
 */
export function setCameraStatus(online) {
  els.statusCamera.className = `status-pill ${online ? 'online' : 'offline'}`;
  els.statusCamera.textContent = online ? 'CAM ✓' : 'CAM ✗';
}

export function setTrackingStatus(online) {
  els.statusTracking.className = `status-pill ${online ? 'online' : 'offline'}`;
  els.statusTracking.textContent = online ? 'HAND ✓' : 'HAND ✗';
}

export function setGestureDisplay(gesture) {
  const icons = {
    none: '—',
    open: '🖐 Open',
    fist: '✊ Fist',
    pinch: '🤏 Pinch',
  };
  els.statusGesture.textContent = icons[gesture] || gesture;
}

/**
 * Show started state.
 */
export function setStarted() {
  els.btnStart.classList.add('hidden');
  els.btnStop.classList.remove('hidden');
}

/**
 * Show stopped state.
 */
export function setStopped() {
  els.btnStart.classList.remove('hidden');
  els.btnStop.classList.add('hidden');
}

/**
 * Take a screenshot from the canvas.
 */
export function setupScreenshot(renderer) {
  els.btnScreenshot.addEventListener('click', () => {
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `energy-orb-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });
}
