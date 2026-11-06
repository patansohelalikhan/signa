/**
 * Signa AI - Core Landmark Engine & Spatial Geometry (v3.3)
 * Dynamic Left/Right Inversion, Ambidextrous Invariant Featurizer & Distance Matching
 */
(function (root) {
  "use strict";

  const DIM = 129; // 2 hands x 63 landmark values + 3 for offset

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17]             // Palm base
  ];

  /** Check user's preferred hand orientation toggle from localStorage */
  function shouldInvertHands() {
    try {
      const v = localStorage.getItem("signa_flip_hands");
      return v === "true"; // default is false (natural sensor order)
    } catch {
      return false;
    }
  }

  function setInvertHands(invert) {
    try {
      localStorage.setItem("signa_flip_hands", invert ? "true" : "false");
    } catch (e) {
      console.warn("Storage error", e);
    }
  }

  /** Normalizes raw side taking user's device orientation setting into account */
  function resolveHandSide(rawSide) {
    const invert = shouldInvertHands();
    if (!invert) return rawSide;
    return rawSide === "Left" ? "Right" : "Left";
  }

  /** Normalize hand landmarks relative to wrist and palm scale */
  function handVec(pts) {
    const a = new Float32Array(63);
    const w = pts[0];
    const s = Math.hypot(pts[9].x - w.x, pts[9].y - w.y, (pts[9].z || 0) - (w.z || 0)) || 1;
    pts.forEach((p, i) => {
      a[i * 3]     = (p.x - w.x) / s;
      a[i * 3 + 1] = (p.y - w.y) / s;
      a[i * 3 + 2] = ((p.z || 0) - (w.z || 0)) / s;
    });
    return a;
  }

  /** Featurize hands array into Float32Array(129) */
  function featurize(hands) {
    if (!hands || !hands.length) return null;
    const v = new Float32Array(DIM);
    const slots = [null, null]; // [0: Left, 1: Right]

    for (const h of hands.slice(0, 2)) {
      const realSide = resolveHandSide(h.side);
      let i = realSide === "Left" ? 0 : 1;
      if (slots[i]) i = 1 - i;
      slots[i] = { pts: h.pts, side: realSide };
    }

    slots.forEach((h, i) => {
      if (h) v.set(handVec(h.pts), i * 63);
    });

    // Inter-hand offset if both hands present
    if (slots[0] && slots[1]) {
      const a = slots[0].pts[0], b = slots[1].pts[0];
      const s = Math.hypot(slots[0].pts[9].x - a.x, slots[0].pts[9].y - a.y, (slots[0].pts[9].z || 0) - (a.z || 0)) || 1;
      v[126] = (b.x - a.x) / s;
      v[127] = (b.y - a.y) / s;
      v[128] = ((b.z || 0) - (a.z || 0)) / s;
    }
    return v;
  }

  /** 63-dim hand distance with horizontal flip check */
  function handDist63(h1, off1, h2, off2) {
    let dDirect = 0;
    let dFlipped = 0;

    for (let i = 0; i < 21; i++) {
      const idx1 = off1 + i * 3;
      const idx2 = off2 + i * 3;

      // Direct comparison
      const dx = h1[idx1] - h2[idx2];
      const dy = h1[idx1 + 1] - h2[idx2 + 1];
      const dz = h1[idx1 + 2] - h2[idx2 + 2];
      dDirect += dx * dx + dy * dy + dz * dz;

      // X-flipped comparison (mirror across palm axis for left/right ambidextrous matching)
      const dxFlip = -h1[idx1] - h2[idx2];
      dFlipped += dxFlip * dxFlip + dy * dy + dz * dz;
    }

    return Math.sqrt(Math.min(dDirect, dFlipped));
  }

  /** Distance between two 129-dim feature vectors */
  function dist(a, b) {
    const aHasLeft  = (a[0] !== 0 || a[1] !== 0 || a[2] !== 0);
    const aHasRight = (a[63] !== 0 || a[64] !== 0 || a[65] !== 0);
    const bHasLeft  = (b[0] !== 0 || b[1] !== 0 || b[2] !== 0);
    const bHasRight = (b[63] !== 0 || b[64] !== 0 || b[65] !== 0);

    const aCount = (aHasLeft ? 1 : 0) + (aHasRight ? 1 : 0);
    const bCount = (bHasLeft ? 1 : 0) + (bHasRight ? 1 : 0);

    // If both are 1-hand gestures: match active hands directly
    if (aCount === 1 && bCount === 1) {
      const offA = aHasLeft ? 0 : 63;
      const offB = bHasLeft ? 0 : 63;
      return handDist63(a, offA, b, offB);
    }

    // If both are 2-hand gestures: match both slots + offset
    if (aCount === 2 && bCount === 2) {
      let s = 0;
      for (let i = 0; i < DIM; i++) {
        const d = a[i] - b[i];
        s += d * d;
      }
      return Math.sqrt(s);
    }

    return 9.99;
  }

  /** Nearest-frame distance per sign label */
  function perClass(v, db, skip) {
    const best = {};
    for (const L in db) {
      db[L].forEach((t, ti) => {
        if (skip && skip.l === L && skip.t === ti) return;
        for (const s of t) {
          const d = dist(v, s);
          if (best[L] === undefined || d < best[L]) best[L] = d;
        }
      });
    }
    return best;
  }

  /** Decision logic */
  function decide(best, thr, amb) {
    thr = thr || 2.4;
    amb = amb || 0.92;
    const r = Object.entries(best).sort((a, b) => a[1] - b[1]);
    if (!r.length) return { status: "empty" };
    const [l1, d1] = r[0];

    const confidence = Math.max(0, Math.min(100, Math.round((1 - (d1 / thr)) * 100)));

    if (d1 > thr) return { status: "unknown", d: d1, confidence: 0, closest: l1 };
    if (r[1] && d1 / r[1][1] > amb && (r[1][1] - d1) < 0.12) {
      return { status: "ambiguous", a: l1, b: r[1][0], d: d1, confidence };
    }
    return { status: "ok", label: l1, d: d1, confidence };
  }

  /** Leave-one-out cross validation */
  function evaluate(db, stride) {
    stride = stride || 3;
    const per = {}, conf = {}, within = [];
    let n = 0, c = 0;
    for (const L in db) {
      if (db[L].length < 2) continue;
      per[L] = { n: 0, c: 0 };
      db[L].forEach((t, ti) => t.forEach((v, fi) => {
        if (fi % stride) return;
        const best = perClass(v, db, { l: L, t: ti });
        const r = Object.entries(best).sort((a, b) => a[1] - b[1]);
        if (!r.length) return;
        n++;
        per[L].n++;
        if (best[L] !== undefined) within.push(best[L]);
        if (r[0][0] === L) {
          c++;
          per[L].c++;
        } else {
          const k = L + " → " + r[0][0];
          conf[k] = (conf[k] || 0) + 1;
        }
      }));
    }
    within.sort((a, b) => a - b);
    return {
      overall: n ? c / n : null,
      n,
      per,
      conf,
      p90: within.length ? within[Math.floor(within.length * 0.9)] : null
    };
  }

  /** Temporal smoothing */
  function makeSmoother(size, need) {
    size = size || 6;
    need = need || 3;
    const w = [];
    let last = null;
    return {
      add(l) {
        w.push(l);
        if (w.length > size) w.shift();
        if (w.length === size && w.every(x => x === null)) last = null;
        if (l && w.filter(x => x === l).length >= need && l !== last) {
          last = l;
          return l;
        }
        return null;
      },
      reset() {
        w.length = 0;
        last = null;
      }
    };
  }

  /** Extract Anatomical Finger Extension Metrics */
  function extractFingerMetrics(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;
    const w = landmarks[0];
    const palmSize = Math.hypot(landmarks[9].x - w.x, landmarks[9].y - w.y) || 1;

    function extensionRatio(tipIdx, mcpIdx) {
      const tipDist = Math.hypot(landmarks[tipIdx].x - w.x, landmarks[tipIdx].y - w.y);
      const mcpDist = Math.hypot(landmarks[mcpIdx].x - w.x, landmarks[mcpIdx].y - w.y);
      const ratio = tipDist / (mcpDist * 1.85);
      return Math.min(100, Math.max(0, Math.round(ratio * 100)));
    }

    return {
      thumb: extensionRatio(4, 2),
      index: extensionRatio(8, 5),
      middle: extensionRatio(12, 9),
      ring: extensionRatio(16, 13),
      pinky: extensionRatio(20, 17),
      palmScale: palmSize
    };
  }

  /** Sleek Skeleton Renderer with dynamic resolved handedness */
  function drawSkeleton(ctx, landmarksList, handednessList, width, height, isMirrored = true) {
    if (!landmarksList || !landmarksList.length) return;
    ctx.save();
    if (isMirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    landmarksList.forEach((landmarks, hIndex) => {
      const rawSide = handednessList && handednessList[hIndex] && handednessList[hIndex][0]
        ? handednessList[hIndex][0].categoryName
        : "Right";
      const realSide = resolveHandSide(rawSide);
      const isRight = realSide === "Right";

      const boneColor = isRight ? "rgba(41, 151, 255, 0.75)" : "rgba(48, 209, 88, 0.75)";
      const jointColor = isRight ? "#2997ff" : "#30d158";

      ctx.lineWidth = 3;
      ctx.strokeStyle = boneColor;
      ctx.lineCap = "round";
      for (const [start, end] of HAND_CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }

      for (let i = 0; i < landmarks.length; i++) {
        const p = landmarks[i];
        const isTip = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20);
        const radius = isTip ? 5.5 : 3.5;

        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isTip ? "#ffffff" : jointColor;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  /* ==========================================================================
     Unified Global Theme System (Synchronized Across All Pages & Tabs)
     ========================================================================== */
  const THEME_KEY = "signa_theme";
  const THEME_CHANNEL = "signa_theme_sync_channel";
  let themeBroadcastChannel = null;

  function parseThemeValue(val) {
    if (!val) return "system";
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
      try {
        return JSON.parse(val);
      } catch (_) {
        return val.replace(/^"|"$/g, "");
      }
    }
    return val;
  }

  const Theme = {
    KEY: THEME_KEY,

    get() {
      try {
        return parseThemeValue(localStorage.getItem(THEME_KEY));
      } catch {
        return "system";
      }
    },

    getResolved() {
      const mode = this.get();
      if (mode === "system") {
        return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)
          ? "light"
          : "dark";
      }
      return mode === "light" ? "light" : "dark";
    },

    apply() {
      const resolved = this.getResolved();
      const raw = this.get();

      if (resolved === "light") {
        document.documentElement.dataset.theme = "light";
      } else {
        document.documentElement.removeAttribute("data-theme");
      }

      // Update button icons & titles across DOM
      const btns = document.querySelectorAll("#btnThemeToggle, .btn-theme-toggle");
      btns.forEach(btn => {
        btn.textContent = resolved === "light" ? "🌙" : "☀️";
        btn.title = resolved === "light" ? "Switch to Dark Mode (🌓)" : "Switch to Light Mode (🌓)";
        btn.setAttribute("aria-label", btn.title);
      });

      // Update settings select dropdown if present
      const themeSelect = document.querySelector("#cfgThemeSelect");
      if (themeSelect) {
        themeSelect.value = raw;
      }

      // Dispatch event for page-specific listeners (e.g. redraw charts in analyze)
      window.dispatchEvent(new CustomEvent("signa-theme-change", { detail: { resolved, mode: raw } }));
    },

    set(mode) {
      try {
        localStorage.setItem(THEME_KEY, mode);
      } catch (e) {
        console.warn("Theme storage error", e);
      }
      this.apply();
      this.broadcast(mode);
    },

    toggle() {
      const resolved = this.getResolved();
      const next = resolved === "dark" ? "light" : "dark";
      this.set(next);
      return next;
    },

    broadcast(mode) {
      try {
        if (!themeBroadcastChannel && typeof BroadcastChannel !== "undefined") {
          themeBroadcastChannel = new BroadcastChannel(THEME_CHANNEL);
        }
        if (themeBroadcastChannel) {
          themeBroadcastChannel.postMessage({ type: "THEME_SYNC", theme: mode });
        }
      } catch (_) {}
    },

    init() {
      this.apply();

      // Cross-window storage event (fires in other open tabs/pages of same domain)
      window.addEventListener("storage", (e) => {
        if (e.key === THEME_KEY) {
          this.apply();
        }
      });

      // BroadcastChannel for instant same-browser cross-page sync
      try {
        if (typeof BroadcastChannel !== "undefined") {
          if (!themeBroadcastChannel) {
            themeBroadcastChannel = new BroadcastChannel(THEME_CHANNEL);
          }
          themeBroadcastChannel.onmessage = (e) => {
            if (e.data && e.data.type === "THEME_SYNC") {
              this.apply();
            }
          };
        }
      } catch (_) {}

      // OS theme preference changes
      if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if (this.get() === "system") {
            this.apply();
          }
        });
      }

      // Auto-bind toggle buttons
      const bindButtons = () => {
        document.querySelectorAll("#btnThemeToggle, .btn-theme-toggle").forEach(btn => {
          btn.onclick = (e) => {
            e.preventDefault();
            this.toggle();
          };
        });
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindButtons);
      } else {
        bindButtons();
      }
    }
  };

  Theme.init();

  root.SignaCore = {
    DIM,
    HAND_CONNECTIONS,
    shouldInvertHands,
    setInvertHands,
    resolveHandSide,
    handVec,
    featurize,
    dist,
    perClass,
    decide,
    evaluate,
    makeSmoother,
    extractFingerMetrics,
    drawSkeleton,
    Theme
  };

})(typeof window !== "undefined" ? window : globalThis);
