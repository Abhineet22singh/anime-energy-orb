/**
 * ui.js – Production UI management, glass HUD, composite snapshot, video recording controls & entrance portal
 */

const els = {};

let settings = {
  orbSize: 1.0,
  energy: 1.0,
  smokeDensity: 1.0,
  particleDensity: 1.0,
  bloomEnabled: true,
  smokeEnabled: true,
  particlesEnabled: true,
  arcsEnabled: true,
  filamentsEnabled: true,
  skeletonEnabled: true,
  soundEnabled: true,
  animeFilterEnabled: true,
  animeStyle: 1, // 0=Natural, 1=Shonen, 2=Cyberpunk, 3=Ghibli, 4=Manga
  animeIntensity: 1.0,
  airDrawEnabled: true,
  mouthSmokeEnabled: true,
};

let onEnter = null;
let onReset = null;
let onSoundToggle = null;
let onStyleChange = null;
let onToggleRecord = null;
let onToggleAirDraw = null;
let onClearDrawing = null;
let hasTrackedHandOnce = false;

export function initUI(callbacks) {
  onEnter = callbacks.onEnter;
  onReset = callbacks.onReset;
  onSoundToggle = callbacks.onSoundToggle;
  onStyleChange = callbacks.onStyleChange;
  onToggleRecord = callbacks.onToggleRecord;
  onToggleAirDraw = callbacks.onToggleAirDraw;
  onClearDrawing = callbacks.onClearDrawing;

  // Cache elements
  els.portalScreen = document.getElementById('portal-screen');
  els.loaderStatus = document.getElementById('loader-status');
  els.statusMsg = els.portalScreen?.querySelector('.status-msg');
  els.btnEnter = document.getElementById('btn-enter');
  els.app = document.getElementById('app');
  els.cameraFeed = document.getElementById('camera-feed');
  els.animeCanvas = document.getElementById('anime-canvas');
  els.onboardingHint = document.getElementById('onboarding-hint');
  els.gesturePill = document.getElementById('gesture-pill');
  els.gestureIcon = document.getElementById('gesture-icon');
  els.gestureLabel = document.getElementById('gesture-label');
  els.btnRecord = document.getElementById('btn-record');
  els.recLabel = document.getElementById('rec-label');
  els.btnAirDrawToggle = document.getElementById('btn-airdraw-toggle');
  els.btnSound = document.getElementById('btn-sound');
  els.btnScreenshot = document.getElementById('btn-screenshot');
  els.btnFullscreen = document.getElementById('btn-fullscreen');
  els.sidePanel = document.getElementById('side-panel');
  els.btnPanelToggle = document.getElementById('btn-panel-toggle');
  els.btnPanelClose = document.getElementById('btn-panel-close');
  els.btnReset = document.getElementById('btn-reset');

  // Sliders & value badges
  els.sliderOrbSize = document.getElementById('slider-orb-size');
  els.valOrbSize = document.getElementById('val-orb-size');
  els.sliderEnergy = document.getElementById('slider-energy');
  els.valEnergy = document.getElementById('val-energy');
  els.sliderSmoke = document.getElementById('slider-smoke');
  els.valSmoke = document.getElementById('val-smoke');
  els.sliderParticles = document.getElementById('slider-particles');
  els.valParticles = document.getElementById('val-particles');
  els.sliderAnimeIntensity = document.getElementById('slider-anime-intensity');
  els.valAnimeIntensity = document.getElementById('val-anime-intensity');

  // Toggles
  els.toggleBloom = document.getElementById('toggle-bloom');
  els.toggleSmoke = document.getElementById('toggle-smoke');
  els.toggleParticles = document.getElementById('toggle-particles');
  els.toggleArcs = document.getElementById('toggle-arcs');
  els.toggleFilaments = document.getElementById('toggle-filaments');
  els.toggleSkeleton = document.getElementById('toggle-skeleton');
  els.toggleAnimeFilter = document.getElementById('toggle-anime-filter');
  els.toggleMouthSmoke = document.getElementById('toggle-mouth-smoke');
  els.toggleAirDraw = document.getElementById('toggle-airdraw');
  els.btnClearDrawing = document.getElementById('btn-clear-drawing');

  // Style selector buttons
  els.styleBtns = document.querySelectorAll('.style-btn');

  // Entrance button
  els.btnEnter?.addEventListener('click', () => {
    if (onEnter) onEnter();
  });

  // Video Record button
  els.btnRecord?.addEventListener('click', () => {
    if (onToggleRecord) onToggleRecord();
  });

  // Air-draw toggle button in header
  els.btnAirDrawToggle?.addEventListener('click', () => {
    settings.airDrawEnabled = !settings.airDrawEnabled;
    if (els.toggleAirDraw) els.toggleAirDraw.checked = settings.airDrawEnabled;
    setAirDrawUI(settings.airDrawEnabled);
    if (onToggleAirDraw) onToggleAirDraw(settings.airDrawEnabled);
  });

  // Air-draw checkbox in drawer
  els.toggleAirDraw?.addEventListener('change', (e) => {
    settings.airDrawEnabled = e.target.checked;
    setAirDrawUI(settings.airDrawEnabled);
    if (onToggleAirDraw) onToggleAirDraw(settings.airDrawEnabled);
  });

  // Clear air drawing button
  els.btnClearDrawing?.addEventListener('click', () => {
    if (onClearDrawing) onClearDrawing();
  });

  // Style buttons listener
  els.styleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const styleIdx = parseInt(btn.getAttribute('data-style'), 10);
      setActiveStyleUI(styleIdx);
      if (onStyleChange) onStyleChange(styleIdx);
    });
  });

  // Anime Stylization Intensity
  els.sliderAnimeIntensity?.addEventListener('input', (e) => {
    settings.animeIntensity = parseFloat(e.target.value);
    if (els.valAnimeIntensity) {
      els.valAnimeIntensity.textContent = `${settings.animeIntensity.toFixed(2)}x`;
    }
  });

  // Sound toggle
  els.btnSound?.addEventListener('click', () => {
    if (onSoundToggle) {
      const state = onSoundToggle();
      els.btnSound.textContent = state ? '🔊' : '🔇';
    }
  });

  // Fullscreen
  els.btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Side Panel Toggle & Close
  els.btnPanelToggle?.addEventListener('click', () => {
    els.sidePanel?.classList.toggle('collapsed');
  });

  els.btnPanelClose?.addEventListener('click', () => {
    els.sidePanel?.classList.add('collapsed');
  });

  // Reset
  els.btnReset?.addEventListener('click', () => {
    if (onReset) onReset();
  });

  // Sliders with value badges
  els.sliderOrbSize?.addEventListener('input', (e) => {
    settings.orbSize = parseFloat(e.target.value);
    if (els.valOrbSize) els.valOrbSize.textContent = `${settings.orbSize.toFixed(2)}x`;
  });

  els.sliderEnergy?.addEventListener('input', (e) => {
    settings.energy = parseFloat(e.target.value);
    if (els.valEnergy) els.valEnergy.textContent = `${settings.energy.toFixed(2)}x`;
  });

  els.sliderSmoke?.addEventListener('input', (e) => {
    settings.smokeDensity = parseFloat(e.target.value);
    if (els.valSmoke) els.valSmoke.textContent = `${settings.smokeDensity.toFixed(1)}x`;
  });

  els.sliderParticles?.addEventListener('input', (e) => {
    settings.particleDensity = parseFloat(e.target.value);
    if (els.valParticles) els.valParticles.textContent = `${settings.particleDensity.toFixed(1)}x`;
  });

  // VFX Layer Toggles
  els.toggleBloom?.addEventListener('change', (e) => { settings.bloomEnabled = e.target.checked; });
  els.toggleSmoke?.addEventListener('change', (e) => { settings.smokeEnabled = e.target.checked; });
  els.toggleParticles?.addEventListener('change', (e) => { settings.particlesEnabled = e.target.checked; });
  els.toggleArcs?.addEventListener('change', (e) => { settings.arcsEnabled = e.target.checked; });
  els.toggleFilaments?.addEventListener('change', (e) => { settings.filamentsEnabled = e.target.checked; });
  els.toggleSkeleton?.addEventListener('change', (e) => { settings.skeletonEnabled = e.target.checked; });
  els.toggleAnimeFilter?.addEventListener('change', (e) => { settings.animeFilterEnabled = e.target.checked; });
  els.toggleMouthSmoke?.addEventListener('change', (e) => { settings.mouthSmokeEnabled = e.target.checked; });
}

export function setActiveStyleUI(styleIdx) {
  settings.animeStyle = styleIdx;
  els.styleBtns?.forEach((b) => {
    const s = parseInt(b.getAttribute('data-style'), 10);
    if (s === styleIdx) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
}

export function setRecordingUI(isRecording, timerText = 'REC') {
  if (!els.btnRecord) return;
  if (isRecording) {
    els.btnRecord.classList.add('recording');
    if (els.recLabel) els.recLabel.textContent = timerText;
  } else {
    els.btnRecord.classList.remove('recording');
    if (els.recLabel) els.recLabel.textContent = 'REC';
  }
}

export function setAirDrawUI(enabled) {
  if (els.btnAirDrawToggle) {
    if (enabled) {
      els.btnAirDrawToggle.classList.add('active');
    } else {
      els.btnAirDrawToggle.classList.remove('active');
    }
  }
}

export function getSettings() {
  return settings;
}

export function setModelReady() {
  if (els.loaderStatus) els.loaderStatus.classList.add('hidden');
  if (els.btnEnter) els.btnEnter.classList.remove('hidden');
}

export function setStatusText(text) {
  if (els.statusMsg) els.statusMsg.textContent = text;
}

export function enterExperience() {
  if (els.portalScreen) {
    els.portalScreen.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    els.portalScreen.style.opacity = '0';
    els.portalScreen.style.transform = 'scale(1.05)';
    setTimeout(() => {
      els.portalScreen.classList.add('hidden');
    }, 600);
  }
  if (els.app) els.app.classList.remove('hidden');
}

export function setGestureDisplay(gesture, isTwoHand = false) {
  if (!els.gesturePill) return;

  if (isTwoHand) {
    els.gesturePill.className = 'gesture-pill open';
    if (els.gestureIcon) els.gestureIcon.textContent = '🙌';
    if (els.gestureLabel) els.gestureLabel.textContent = 'DUAL PALM';
    notifyHandTracked();
    return;
  }

  const map = {
    open: { icon: '🖐', label: 'OPEN PALM', class: 'open' },
    fist: { icon: '✊', label: 'CHARGING', class: 'fist' },
    pinch: { icon: '🤏', label: 'PINCH SCALE', class: 'pinch' },
    none: { icon: '👁️', label: 'SEARCHING', class: '' },
  };

  const g = map[gesture] || map.none;
  els.gesturePill.className = `gesture-pill ${g.class}`;
  if (els.gestureIcon) els.gestureIcon.textContent = g.icon;
  if (els.gestureLabel) els.gestureLabel.textContent = g.label;

  if (gesture !== 'none') {
    notifyHandTracked();
  }
}

function notifyHandTracked() {
  if (!hasTrackedHandOnce) {
    hasTrackedHandOnce = true;
    if (els.onboardingHint) {
      els.onboardingHint.classList.add('fade-out');
    }
  }
}

let perfectFramingTimer = 0;
let hintDismissed = false;

export function updateFramingGuidance(hasFace, hasHand, dt = 0.016) {
  if (hintDismissed) return;
  const hint = els.onboardingHint;
  const text = document.getElementById('hint-text');
  if (!hint || !text) return;

  if (hasFace && hasHand) {
    perfectFramingTimer += dt;
    text.textContent = '✨ Perfect Framing — Energy Locked!';
    hint.classList.remove('fade-out');
    if (perfectFramingTimer > 2.5) {
      hint.classList.add('fade-out');
      hintDismissed = true;
    }
  } else if (hasFace && !hasHand) {
    perfectFramingTimer = 0;
    text.textContent = 'Face detected — Raise your open palm beside your face';
    hint.classList.remove('fade-out');
  } else if (!hasFace && hasHand) {
    perfectFramingTimer = 0;
    text.textContent = 'Hand detected — Frame your face together with your hand';
    hint.classList.remove('fade-out');
  } else {
    perfectFramingTimer = 0;
    text.textContent = 'Frame both your face and your raised hand in view';
    hint.classList.remove('fade-out');
  }
}

export function resetFramingHint() {
  perfectFramingTimer = 0;
  hintDismissed = false;
  const hint = els.onboardingHint;
  if (hint) hint.classList.remove('fade-out');
}

/**
 * Composite Mirror Selfie Photo Capture
 * Blends live background (Anime-filtered or raw camera) + Three.js canvas into an HD photo
 */
export function setupCompositeScreenshot(renderer) {
  els.btnScreenshot?.addEventListener('click', () => {
    const video = document.getElementById('camera-feed');
    const animeCanvas = document.getElementById('anime-canvas');
    const threeCanvas = renderer.domElement;

    const w = threeCanvas.width;
    const h = threeCanvas.height;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ctx = exportCanvas.getContext('2d');

    // 1. Draw stylized anime canvas or mirrored raw video
    if (animeCanvas && settings.animeFilterEnabled && settings.animeStyle !== 0) {
      ctx.drawImage(animeCanvas, 0, 0, w, h);
    } else if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1); // Horizontal flip for mirror selfie

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const vAspect = vw / vh;
      const cAspect = w / h;

      let dw, dh, dx, dy;
      if (cAspect > vAspect) {
        dw = w;
        dh = w / vAspect;
        dx = 0;
        dy = (h - dh) / 2;
      } else {
        dh = h;
        dw = h * vAspect;
        dx = (w - dw) / 2;
        dy = 0;
      }

      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Draw 3D Three.js effects layer on top
    ctx.drawImage(threeCanvas, 0, 0, w, h);

    // 3. Trigger download
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anime-energy-selfie-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });
}
