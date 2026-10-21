/**
 * handTracking.js – Dual MediaPipe Hand & Face Landmarker integration
 * Tracks both the user's real hand (for orb & orange finger filaments)
 * and the user's real face (for face-aware smoke curling and eye clarity).
 */

import { HandLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let handLandmarker = null;
let faceLandmarker = null;
let isRunning = false;
let lastHandResults = null;
let lastFaceResults = null;

/**
 * Load both HandLandmarker and FaceLandmarker models.
 * @param {function} onProgress – progress status callback
 */
export async function initVisionTracking(onProgress) {
  if (onProgress) onProgress('Loading vision WASM…');

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );

  if (onProgress) onProgress('Loading Hand Tracking Model…');
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

  if (onProgress) onProgress('Loading Face Tracking Model…');
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (err) {
    console.warn('FaceLandmarker load fallback:', err);
  }

  isRunning = true;
}

/**
 * Process a video frame and detect both hand and face landmarks.
 * @param {HTMLVideoElement} video
 * @param {number} timestamp – performance.now()
 * @returns {{ hands: object|null, face: object|null }}
 */
export function detectVision(video, timestamp) {
  if (!isRunning || video.readyState < 2) {
    return { hands: lastHandResults, face: lastFaceResults };
  }

  // 1. Detect Hand Landmarks
  if (handLandmarker) {
    try {
      lastHandResults = handLandmarker.detectForVideo(video, timestamp);
    } catch (e) {
      // Keep previous frame results on transient errors
    }
  }

  // 2. Detect Face Landmarks
  if (faceLandmarker) {
    try {
      lastFaceResults = faceLandmarker.detectForVideo(video, timestamp);
    } catch (e) {
      // Keep previous frame results on transient errors
    }
  }

  return { hands: lastHandResults, face: lastFaceResults };
}

export function isTrackingReady() {
  return handLandmarker !== null;
}

export function hasFaceTracking() {
  return faceLandmarker !== null;
}

export function dispose() {
  if (handLandmarker) {
    handLandmarker.close();
    handLandmarker = null;
  }
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
  isRunning = false;
}
