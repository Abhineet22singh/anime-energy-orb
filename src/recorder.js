/**
 * recorder.js – Full-resolution AR Video Recording with Audio for Anime Energy Orb
 *
 * Captures live composite stream (Background Anime/Webcam + Three.js VFX + Synthesized Audio)
 * and exports crisp HD WebM/MP4 video clips directly to the user's downloads.
 */

export class VideoRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recording = false;
    this.recordCanvas = document.createElement('canvas');
    this.recordCtx = this.recordCanvas.getContext('2d', { alpha: false });
    this.animFrameId = null;
    this.startTime = 0;
    this.timerInterval = null;
    this.stream = null;
  }

  isRecording() {
    return this.recording;
  }

  /**
   * Start recording live composite frames with audio
   */
  startRecording({ getBackgroundCanvas, getForegroundCanvas, audioStream, onTick, onError }) {
    if (this.recording) return;

    try {
      // 1. Determine supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const selectedMime = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const fg = getForegroundCanvas();
      if (!fg) throw new Error('Canvas not available');

      // Use target 1080p or screen resolution (clamped to max 1920x1080 for smooth encoding)
      const maxW = 1280;
      const aspect = fg.width / fg.height;
      const w = Math.min(fg.width, maxW);
      const h = Math.round(w / aspect);

      this.recordCanvas.width = w;
      this.recordCanvas.height = h;

      // 2. Setup composite stream
      this.stream = this.recordCanvas.captureStream(30);

      // Add audio track if available from Web Audio
      if (audioStream) {
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          this.stream.addTrack(audioTracks[0]);
        }
      }

      this.recordedChunks = [];
      const options = {
        videoBitsPerSecond: 4500000,
      };
      if (selectedMime) options.mimeType = selectedMime;

      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this._finalizeRecording();
      };

      // 3. Composite Rendering Loop (runs at 30 fps)
      const renderFrame = () => {
        if (!this.recording) return;

        const bg = getBackgroundCanvas ? getBackgroundCanvas() : null;
        const ctx = this.recordCtx;

        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, w, h);

        // Draw background (mirrored if video element, or pre-rendered anime canvas)
        if (bg) {
          if (bg.tagName === 'VIDEO') {
            if (bg.readyState >= 2) {
              ctx.save();
              ctx.translate(w, 0);
              ctx.scale(-1, 1); // Mirror horizontal

              const vw = bg.videoWidth || 1280;
              const vh = bg.videoHeight || 720;
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
              ctx.drawImage(bg, dx, dy, dw, dh);
              ctx.restore();
            }
          } else {
            // Background is anime-canvas or already transformed
            ctx.drawImage(bg, 0, 0, w, h);
          }
        }

        // Draw foreground Three.js canvas (energy orb, filaments, mist, trails)
        if (fg) {
          ctx.drawImage(fg, 0, 0, w, h);
        }

        this.animFrameId = requestAnimationFrame(renderFrame);
      };

      this.recording = true;
      this.startTime = performance.now();
      this.mediaRecorder.start(250); // timeslice 250ms
      renderFrame();

      // 4. Timer interval callback
      if (onTick) {
        this.timerInterval = setInterval(() => {
          if (!this.recording) return;
          const elapsedSec = Math.floor((performance.now() - this.startTime) / 1000);
          const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          onTick(`${mins}:${secs}`);
        }, 500);
      }
    } catch (err) {
      console.error('Failed to start video recording:', err);
      this.recording = false;
      if (onError) onError(err);
    }
  }

  /**
   * Stop recording and initiate download
   */
  stopRecording() {
    if (!this.recording || !this.mediaRecorder) return;
    this.recording = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  _finalizeRecording() {
    if (this.recordedChunks.length === 0) return;

    const mime = this.mediaRecorder.mimeType || 'video/webm';
    const blob = new Blob(this.recordedChunks, { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    a.download = `anime-energy-studio-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);

    // Clean up tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}

export const videoRecorder = new VideoRecorder();
