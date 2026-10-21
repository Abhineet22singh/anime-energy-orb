# 🔮 Anime Energy Orb

A real-time augmented reality experience that lets you summon and control a glowing anime energy orb above your palm using your webcam and hand gestures.

![Energy Orb](https://img.shields.io/badge/Three.js-0.162-blue) ![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-green) ![Vite](https://img.shields.io/badge/Vite-5.4-purple)

## ✨ Features

- **Real-time hand tracking** via MediaPipe Hand Landmarker
- **Procedural energy orb** with GLSL shaders, animated distortion, and multiple glow layers
- **Volumetric smoke** particles with turbulence
- **Floating particles and sparks** orbiting the orb
- **Electrical arcs** with random flickering
- **Post-processing**: Unreal Bloom, color grading, vignette
- **Gesture controls**: open palm, fist, pinch, two-hand mode
- **Demo mode** with mouse control when camera is unavailable
- **Screenshot capture**
- **Responsive UI** with sliders and toggles

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open **http://localhost:5173** in Chrome or Edge.

## 📷 Camera Permissions

1. Click **"▶ Start Experience"**
2. Allow camera access when prompted
3. Hold your open palm up in front of the camera
4. The energy orb will appear above your palm!

### If camera is unavailable
Click **"🖱 Demo Mode"** to control the orb with your mouse.

## 🤚 Gestures

| Gesture | Action |
|---------|--------|
| 🖐 Open palm | Summon the energy orb |
| ✊ Closed fist | Compress and charge the orb |
| 🤏 Pinch (thumb + index) | Control orb size |
| 💨 Fast hand movement | Stronger particle trails |
| 🙌 Two open palms | Create a mega orb between hands |

## ⚙️ Controls

- **Orb Size** – Scale of the energy sphere
- **Energy Intensity** – Brightness and glow strength
- **Smoke Density** – Amount of smoke particles
- **Particle Density** – Floating particle count
- **Toggle Bloom** – Post-processing glow
- **Toggle Smoke/Particles/Arcs** – Individual effect layers

## 🏗️ Project Structure

```
├── index.html          # Entry HTML
├── package.json        # Dependencies
├── vite.config.js      # Vite configuration
└── src/
    ├── main.js         # App entry, animation loop
    ├── camera.js       # Webcam access
    ├── handTracking.js # MediaPipe integration
    ├── gestures.js     # Gesture recognition
    ├── orb.js          # Procedural energy orb (GLSL)
    ├── particles.js    # GPU particle systems
    ├── smoke.js        # Volumetric smoke
    ├── effects.js      # Post-processing & arcs
    ├── ui.js           # UI bindings
    └── style.css       # Styling
```

## 📱 Mobile

Run `npm run dev -- --host` and access from your phone on the same network.
Camera access requires HTTPS in production — use `localhost` for development.

## 🌐 Deployment

```bash
npm run build
```

Deploy the `dist/` folder to any static hosting (Vercel, Netlify, GitHub Pages).
**Must be served over HTTPS** for camera access to work.

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Camera not working | Check browser permissions, ensure HTTPS or localhost |
| Black screen | Check WebGL support in browser |
| Orb not appearing | Open your palm clearly, ensure good lighting |
| Laggy tracking | Close other tabs, try lower resolution |
| Model not loading | Check internet connection (model downloads from CDN) |

## 📄 License

MIT
