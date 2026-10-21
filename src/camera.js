/**
 * camera.js – Webcam access and management
 */

let videoEl = null;
let stream = null;
let cameraReady = false;

/**
 * Initialise and start the webcam feed.
 * @param {HTMLVideoElement} video – the <video> element to attach the stream to
 * @returns {Promise<HTMLVideoElement>}
 */
export async function startCamera(video) {
  videoEl = video;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, min: 24 },
      },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play();
        resolve();
      };
    });
    cameraReady = true;
    return videoEl;
  } catch (err) {
    cameraReady = false;
    throw err;
  }
}

/** Stop all tracks */
export function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }
  cameraReady = false;
}

export function isCameraReady() {
  return cameraReady;
}

export function getVideo() {
  return videoEl;
}
