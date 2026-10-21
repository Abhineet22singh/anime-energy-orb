/**
 * gestures.js – Gesture recognition from hand landmarks
 *
 * MediaPipe hand landmarks (21 points):
 *  0 = wrist
 *  4 = thumb tip
 *  8 = index tip
 * 12 = middle tip
 * 16 = ring tip
 * 20 = pinky tip
 *  5 = index MCP
 *  9 = middle MCP
 * 13 = ring MCP
 * 17 = pinky MCP
 */

// ── Smoothing helpers ──

/** Exponential moving average */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

// ── Per-hand state ──

const handStates = [createHandState(), createHandState()];

function createHandState() {
  return {
    smoothedPalm: { x: 0.5, y: 0.5, z: 0 },
    prevPalm: { x: 0.5, y: 0.5, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    gesture: 'none',
    gestureSmoothed: 'none',
    gestureTimer: 0,
    openness: 0,
    pinchDist: 1,
    present: false,
    lostFrames: 0,
  };
}

// ── Configuration ──

const CONFIG = {
  smoothing: 0.35,          // position smoothing (lower = smoother but more latent)
  gestureCooldown: 6,       // frames before gesture can change
  openThreshold: 0.18,      // finger distance threshold for "open"
  closedThreshold: 0.10,    // threshold for "closed"
  pinchThreshold: 0.07,     // thumb-index distance for pinch
  lostTimeout: 15,          // frames before declaring hand lost
};

/**
 * Compute the palm centre from landmarks.
 */
function palmCenter(lm) {
  // Average of wrist (0), index MCP (5), middle MCP (9), ring MCP (13), pinky MCP (17)
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0, z = 0;
  for (const i of ids) {
    x += lm[i].x;
    y += lm[i].y;
    z += lm[i].z;
  }
  return { x: x / 5, y: y / 5, z: z / 5 };
}

/**
 * Measure how open each finger is (distance from tip to MCP relative to palm size).
 */
function fingerOpenness(lm) {
  const pairs = [
    [8, 5],   // index
    [12, 9],  // middle
    [16, 13], // ring
    [20, 17], // pinky
  ];
  // palm size reference
  const palmSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.001;
  let total = 0;
  for (const [tip, mcp] of pairs) {
    const d = Math.hypot(lm[tip].x - lm[mcp].x, lm[tip].y - lm[mcp].y);
    total += d / palmSize;
  }
  return total / 4; // average normalised openness
}

/**
 * Thumb-index pinch distance normalised by palm size.
 */
function pinchDistance(lm) {
  const palmSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.001;
  const d = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  return d / palmSize;
}

/**
 * Process MediaPipe results and return structured gesture data.
 * @param {object} results – from handLandmarker.detectForVideo
 * @param {number} dt – delta-time in seconds
 * @returns {Array<object>} array of hand data objects (up to 2)
 */
export function processGestures(results, dt) {
  const output = [];

  // Mark all as not-present initially
  for (const s of handStates) {
    if (results) {
      // We'll mark them present below
    }
  }

  const numHands = results ? results.landmarks.length : 0;

  for (let i = 0; i < 2; i++) {
    const state = handStates[i];

    if (i < numHands) {
      const lm = results.landmarks[i];
      const rawPalm = palmCenter(lm);
      const open = fingerOpenness(lm);
      const pinch = pinchDistance(lm);

      // Smooth position
      if (!state.present) {
        // First frame: snap to position
        state.smoothedPalm = { ...rawPalm };
      } else {
        state.smoothedPalm = lerpVec(state.smoothedPalm, rawPalm, CONFIG.smoothing);
      }

      // Velocity
      state.velocity = {
        x: (state.smoothedPalm.x - state.prevPalm.x) / Math.max(dt, 0.001),
        y: (state.smoothedPalm.y - state.prevPalm.y) / Math.max(dt, 0.001),
        z: 0,
      };
      state.prevPalm = { ...state.smoothedPalm };

      // Gesture classification with hysteresis
      let rawGesture = 'none';
      if (pinch < CONFIG.pinchThreshold) {
        rawGesture = 'pinch';
      } else if (open > CONFIG.openThreshold) {
        rawGesture = 'open';
      } else if (open < CONFIG.closedThreshold) {
        rawGesture = 'fist';
      } else {
        rawGesture = state.gestureSmoothed; // hysteresis: keep previous
      }

      // Cooldown
      if (rawGesture !== state.gesture) {
        state.gestureTimer++;
        if (state.gestureTimer >= CONFIG.gestureCooldown) {
          state.gesture = rawGesture;
          state.gestureSmoothed = rawGesture;
          state.gestureTimer = 0;
        }
      } else {
        state.gestureTimer = 0;
      }

      state.openness = open;
      state.pinchDist = pinch;
      state.present = true;
      state.lostFrames = 0;

      output.push({
        index: i,
        present: true,
        palm: { ...state.smoothedPalm },
        velocity: { ...state.velocity },
        speed: Math.hypot(state.velocity.x, state.velocity.y),
        gesture: state.gestureSmoothed,
        openness: open,
        pinchDist: pinch,
        landmarks: lm,
      });
    } else {
      // Hand not detected
      state.lostFrames++;
      if (state.lostFrames > CONFIG.lostTimeout) {
        state.present = false;
        state.gestureSmoothed = 'none';
        state.gesture = 'none';
        state.gestureTimer = 0;
      }

      output.push({
        index: i,
        present: state.present,
        palm: { ...state.smoothedPalm },
        velocity: { x: 0, y: 0, z: 0 },
        speed: 0,
        gesture: state.present ? state.gestureSmoothed : 'none',
        openness: state.openness,
        pinchDist: state.pinchDist,
        landmarks: null,
        fading: state.lostFrames > 0,
        fadeProgress: Math.min(state.lostFrames / CONFIG.lostTimeout, 1),
      });
    }
  }

  return output;
}

/**
 * Check if two hands are both open (for mega orb).
 */
export function isTwoHandOpen(hands) {
  return (
    hands.length >= 2 &&
    hands[0].present &&
    hands[1].present &&
    hands[0].gesture === 'open' &&
    hands[1].gesture === 'open'
  );
}

/**
 * Get midpoint between two palms.
 */
export function twoHandMidpoint(hands) {
  if (hands.length < 2) return null;
  return {
    x: (hands[0].palm.x + hands[1].palm.x) / 2,
    y: (hands[0].palm.y + hands[1].palm.y) / 2,
    z: (hands[0].palm.z + hands[1].palm.z) / 2,
  };
}

/**
 * Distance between two palms (normalised).
 */
export function twoHandDistance(hands) {
  if (hands.length < 2) return 0;
  return Math.hypot(
    hands[0].palm.x - hands[1].palm.x,
    hands[0].palm.y - hands[1].palm.y
  );
}
