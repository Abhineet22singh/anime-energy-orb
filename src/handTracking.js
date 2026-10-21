/**
 * handTracking.js – MediaPipe Hand Landmarker integration
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let handLandmarker = null;
let isRunning = false;
let lastResults = null;

/**
 * Load the hand landmarker model.
 * @param {function} onProgress – optional progress callback
 */
export async function initHandTracking(onProgress) {
  if (onProgress) onProgress('Loading vision WASM…');

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );

  if (onProgress) onProgress('Loading hand model…');

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  isRunning = true;
}

/**
 * Process a video frame and return results.
 * @param {HTMLVideoElement} video
 * @param {number} timestamp – performance.now() timestamp
 * @returns {object|null}
 */
export function detectHands(video, timestamp) {
  if (!handLandmarker || !isRunning) return null;
  if (video.readyState < 2) return lastResults;

  try {
    lastResults = handLandmarker.detectForVideo(video, timestamp);
    return lastResults;
  } catch (e) {
    // Occasionally a frame may fail; return previous results
    return lastResults;
  }
}

export function getLastResults() {
  return lastResults;
}

export function isTrackingReady() {
  return handLandmarker !== null;
}

export function dispose() {
  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }
  isRunning = false;
}
