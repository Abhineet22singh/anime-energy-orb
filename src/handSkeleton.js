/**
 * handSkeleton.js – Renders flowing energy streams connecting hand joints
 */

import * as THREE from 'three';

// MediaPipe Hand Connection lines
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm knuckle base
  [5, 9], [9, 13], [13, 17],
];

export class HandSkeleton {
  constructor() {
    this.group = new THREE.Group();
    this.lines = [];
    this.joints = [];
    this.enabled = true;
    this.opacity = 0;

    // Create line segments for bone connections
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x00d4ff),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });

    this.lineSegments = new THREE.LineSegments(lineGeo, this.lineMaterial);
    this.group.add(this.lineSegments);

    // Glowing joint points (21 landmarks)
    const jointGeo = new THREE.BufferGeometry();
    const jointPositions = new Float32Array(21 * 3);
    jointGeo.setAttribute('position', new THREE.BufferAttribute(jointPositions, 3));

    this.jointMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(0x70e0ff),
      size: 0.015,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });

    this.jointPoints = new THREE.Points(jointGeo, this.jointMaterial);
    this.group.add(this.jointPoints);
  }

  update(landmarks, projectFn, isVisible, intensity = 1.0) {
    if (!this.enabled || !isVisible || !landmarks) {
      this.opacity = Math.max(0, this.opacity - 0.08);
      this.lineMaterial.opacity = this.opacity;
      this.jointMaterial.opacity = this.opacity;
      this.group.visible = this.opacity > 0.01;
      return;
    }

    this.opacity = Math.min(1.0, this.opacity + 0.12);
    const targetAlpha = this.opacity * 0.75 * intensity;
    this.lineMaterial.opacity = targetAlpha;
    this.jointMaterial.opacity = targetAlpha * 1.2;
    this.group.visible = true;

    // Project all 21 landmarks into 3D world space
    const worldPoints = [];
    const jointPosAttr = this.jointPoints.geometry.attributes.position;

    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      const pt = projectFn(lm);
      worldPoints.push(pt);

      jointPosAttr.array[i * 3] = pt.x;
      jointPosAttr.array[i * 3 + 1] = pt.y;
      jointPosAttr.array[i * 3 + 2] = pt.z;
    }
    jointPosAttr.needsUpdate = true;

    // Update line connections
    const linePosAttr = this.lineSegments.geometry.attributes.position;
    let ptr = 0;
    for (let c = 0; c < HAND_CONNECTIONS.length; c++) {
      const [a, b] = HAND_CONNECTIONS[c];
      const ptA = worldPoints[a];
      const ptB = worldPoints[b];

      linePosAttr.array[ptr++] = ptA.x;
      linePosAttr.array[ptr++] = ptA.y;
      linePosAttr.array[ptr++] = ptA.z;

      linePosAttr.array[ptr++] = ptB.x;
      linePosAttr.array[ptr++] = ptB.y;
      linePosAttr.array[ptr++] = ptB.z;
    }
    linePosAttr.needsUpdate = true;
  }

  dispose() {
    this.lineSegments.geometry.dispose();
    this.lineMaterial.dispose();
    this.jointPoints.geometry.dispose();
    this.jointMaterial.dispose();
  }
}
