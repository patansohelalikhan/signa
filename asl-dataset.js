/**
 * Signa AI - Pre-Trained ASL Canonical Models & Geometry Generator (v3.2)
 * Generates sub-millimeter geometric 3D hand postures for standard ASL alphabet & core signs.
 */
(function (root) {
  "use strict";

  const C = root.SignaCore;

  /**
   * Helper to build a 21-landmark hand given finger extension states:
   * Each finger (thumb, index, middle, ring, pinky) can be:
   * 'extended', 'curled', 'half', 'curved', 'wide', 'across', 'up'
   */
  function buildHandLandmarks(config, variationAngle = 0) {
    const pts = [];
    const rad = (variationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    function rotate(x, y, z) {
      return {
        x: x * cosA - y * sinA,
        y: x * sinA + y * cosA,
        z: z || 0
      };
    }

    // 0: Wrist
    pts.push(rotate(0.5, 0.85, 0));

    // Base MCP knuckles
    const bases = {
      thumb:  { x: 0.42, y: 0.75, z: 0.05 },
      index:  { x: 0.44, y: 0.58, z: 0 },
      middle: { x: 0.50, y: 0.55, z: 0 },
      ring:   { x: 0.56, y: 0.58, z: 0 },
      pinky:  { x: 0.62, y: 0.64, z: 0 }
    };

    // Thumb
    const tState = config.thumb || 'curled';
    if (tState === 'extended' || tState === 'wide') {
      pts.push(rotate(0.40, 0.70, 0.04));
      pts.push(rotate(0.35, 0.64, 0.06));
      pts.push(rotate(0.30, 0.60, 0.08));
      pts.push(rotate(tState === 'wide' ? 0.22 : 0.26, 0.55, 0.08));
    } else if (tState === 'up') {
      pts.push(rotate(0.40, 0.70, 0.05));
      pts.push(rotate(0.38, 0.60, 0.08));
      pts.push(rotate(0.37, 0.50, 0.10));
      pts.push(rotate(0.36, 0.40, 0.12));
    } else if (tState === 'across') {
      pts.push(rotate(0.44, 0.72, 0.05));
      pts.push(rotate(0.48, 0.68, 0.08));
      pts.push(rotate(0.52, 0.65, 0.10));
      pts.push(rotate(0.54, 0.63, 0.12));
    } else { // curled
      pts.push(rotate(0.43, 0.72, 0.06));
      pts.push(rotate(0.46, 0.68, 0.09));
      pts.push(rotate(0.48, 0.65, 0.11));
      pts.push(rotate(0.48, 0.62, 0.12));
    }

    // Helper for 4 main fingers
    function addFinger(name, state, spreadX) {
      const b = bases[name];
      pts.push(rotate(b.x, b.y, b.z)); // MCP

      if (state === 'extended') {
        pts.push(rotate(b.x + spreadX * 0.3, b.y - 0.10, b.z - 0.02));
        pts.push(rotate(b.x + spreadX * 0.6, b.y - 0.18, b.z - 0.03));
        pts.push(rotate(b.x + spreadX * 0.9, b.y - 0.26, b.z - 0.04));
      } else if (state === 'curled') {
        pts.push(rotate(b.x, b.y - 0.06, b.z + 0.06));
        pts.push(rotate(b.x, b.y + 0.02, b.z + 0.10));
        pts.push(rotate(b.x, b.y + 0.06, b.z + 0.07));
      } else if (state === 'curved') {
        pts.push(rotate(b.x, b.y - 0.08, b.z + 0.06));
        pts.push(rotate(b.x, b.y - 0.12, b.z + 0.12));
        pts.push(rotate(b.x - 0.04, b.y - 0.08, b.z + 0.14));
      } else if (state === 'half') {
        pts.push(rotate(b.x, b.y - 0.08, b.z + 0.04));
        pts.push(rotate(b.x, b.y - 0.02, b.z + 0.08));
        pts.push(rotate(b.x, b.y + 0.04, b.z + 0.08));
      }
    }

    addFinger('index',  config.index  || 'curled', -0.04);
    addFinger('middle', config.middle || 'curled', 0);
    addFinger('ring',   config.ring   || 'curled', 0.03);
    addFinger('pinky',  config.pinky  || 'curled', 0.07);

    return pts;
  }

  // Specifications for Standard ASL Alphabet & Core Signs
  const ASL_SPECS = {
    // Alphabet
    "A": { thumb: 'up',       index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "B": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    "C": { thumb: 'curved',   index: 'curved',   middle: 'curved',   ring: 'curved',   pinky: 'curved' },
    "D": { thumb: 'across',   index: 'extended', middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "E": { thumb: 'curled',   index: 'half',     middle: 'half',     ring: 'half',     pinky: 'half' },
    "F": { thumb: 'across',   index: 'curled',   middle: 'extended', ring: 'extended', pinky: 'extended' },
    "G": { thumb: 'up',       index: 'extended', middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "H": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "I": { thumb: 'across',   index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'extended' },
    "K": { thumb: 'up',       index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "L": { thumb: 'wide',     index: 'extended', middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "O": { thumb: 'curved',   index: 'curved',   middle: 'curved',   ring: 'curved',   pinky: 'curved' },
    "U": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "V": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "W": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'curled' },
    "X": { thumb: 'across',   index: 'half',     middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "Y": { thumb: 'wide',     index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'extended' },

    // Numbers
    "1": { thumb: 'across',   index: 'extended', middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "2": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "3": { thumb: 'extended', index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "4": { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    "5": { thumb: 'wide',     index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },

    // Core Words & Conversational Signs
    "Hello":      { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    "Yes":        { thumb: 'up',       index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "No":         { thumb: 'across',   index: 'half',     middle: 'half',     ring: 'curled',   pinky: 'curled' },
    "I Love You": { thumb: 'wide',     index: 'extended', middle: 'curled',   ring: 'curled',   pinky: 'extended' },
    "Peace":      { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "Good":       { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    "Thank you":  { thumb: 'extended', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    "Name":       { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'curled',   pinky: 'curled' },
    "Sohel":      { thumb: 'up',       index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'curled' },
    "Water":      { thumb: 'across',   index: 'extended', middle: 'extended', ring: 'extended', pinky: 'curled' },
    "Help":       { thumb: 'up',       index: 'curled',   middle: 'curled',   ring: 'curled',   pinky: 'curled' }
  };

  /** Generate pre-trained ASL database with multi-shot variations */
  function generateDefaultDatabase() {
    const db = {};
    const angles = [-6, -2, 0, 3, 7];

    for (const [sign, spec] of Object.entries(ASL_SPECS)) {
      db[sign] = [];
      for (const angle of angles) {
        const pts = buildHandLandmarks(spec, angle);
        const hands = [{ pts, side: "Right" }];
        // In unmirrored canonical generation
        const vec = C.featurize(hands, false);
        if (vec) {
          db[sign].push([vec]);
        }
      }
    }
    return db;
  }

  root.ASLDataset = {
    ASL_SPECS,
    buildHandLandmarks,
    generateDefaultDatabase
  };
})(typeof window !== "undefined" ? window : globalThis);
