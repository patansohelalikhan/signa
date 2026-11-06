"use strict";

/**
 * Signa - Dedicated Training Studio Controller (v3.2)
 * Left/Right Mirror-Corrected with Dynamic 1,200 Word Category Explorer
 */
(function () {
  const C = window.SignaCore;
  const Dict = window.ASL_DICTIONARY;

  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

  const $ = (s) => document.querySelector(s);
  const LS = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  const saveLS = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.warn("Storage error", e);
    }
  };

  // State
  let db = (() => {
    const raw = LS("signa_asl_db_v3", {});
    const hydrated = {};
    for (const L in raw) {
      hydrated[L] = raw[L].map(take => take.map(a => Float32Array.from(a)));
    }
    return hydrated;
  })();

  const saveDb = () => {
    const serialized = {};
    for (const L in db) {
      serialized[L] = db[L].map(take => take.map(v => Array.from(v, x => Math.round(x * 1000) / 1000)));
    }
    saveLS("signa_asl_db_v3", serialized);
  };

  let running = false;
  let landmarker = null;
  let stream = null;
  let lastTs = 0;
  let recording = null;
  let countdownInterval = null;
  let frameCount = 0;
  let fpsTimer = performance.now();

  let facingMode = "user";

  const video = $("#video");
  const canvas = $("#canvasOverlay");
  const ctx = canvas.getContext("2d");
  const statusText = $("#cameraStatusText");
  const signInput = $("#trainSignInput");
  const takesList = $("#takesList");
  const takeCountBadge = $("#takeCountBadge");
  const detectedHandBadge = $("#detectedHandBadge");
  const btnQuickSwapHands = $("#btnQuickSwapHands");
  const btnFlipCamStudio = $("#btnFlipCamStudio");
  const catFilter = $("#trainCatFilter");
  const stageContainer = $("#stageContainer");

  const pulseDot = $("#pulseDot");

  function setStatus(msg, isSuccess = true) {
    statusText.textContent = msg;
    if (pulseDot) {
      pulseDot.style.background = isSuccess ? "var(--apple-green)" : "var(--apple-red)";
      pulseDot.style.boxShadow = `0 0 10px ${isSuccess ? "var(--apple-green)" : "var(--apple-red)"}`;
    }
  }

  function updateHandBadgeUI() {
    if (btnQuickSwapHands) {
      const inverted = C.shouldInvertHands();
      btnQuickSwapHands.style.background = inverted ? "var(--apple-blue)" : "rgba(255,255,255,0.18)";
    }
  }

  if (btnQuickSwapHands) {
    btnQuickSwapHands.onclick = (e) => {
      e.stopPropagation();
      const cur = C.shouldInvertHands();
      C.setInvertHands(!cur);
      updateHandBadgeUI();
    };
  }

  // Cross-Tab & Cross-Page Theme is managed centrally by SignaCore.Theme in core.js
  updateHandBadgeUI();

  // Category Selector & 1,200 Word Cloud
  function initCategories() {
    catFilter.innerHTML = `<option value="all">All Categories (${Dict.count} Words)</option>` +
      Dict.CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");

    catFilter.onchange = () => renderWordChips(catFilter.value);
    renderWordChips("all");
  }

  function renderWordChips(category) {
    const container = $("#quickWordChips");
    container.innerHTML = "";

    const words = category === "all"
      ? Dict.WORDS.slice(0, 100)
      : Dict.WORDS.filter(w => w.cat === category);

    words.forEach(wordObj => {
      const chip = document.createElement("span");
      chip.className = "apple-chip";
      chip.textContent = wordObj.en;
      if (signInput.value.trim().toLowerCase() === wordObj.en.toLowerCase()) {
        chip.classList.add("selected");
      }
      chip.onclick = () => {
        signInput.value = wordObj.en;
        container.querySelectorAll(".apple-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        renderTakesForSign(wordObj.en);
      };
      container.appendChild(chip);
    });
  }

  function renderTakesForSign(signName) {
    takesList.innerHTML = "";
    const clean = (signName || "").trim();
    if (!clean || !db[clean] || !db[clean].length) {
      takesList.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-tertiary);">No takes recorded yet for “${clean || 'this sign'}”.</div>`;
      takeCountBadge.textContent = "0 takes";
      return;
    }

    const takes = db[clean];
    takeCountBadge.textContent = `${takes.length} take${takes.length > 1 ? "s" : ""}`;

    takes.forEach((take, index) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px 10px";
      row.style.background = "rgba(255, 255, 255, 0.04)";
      row.style.borderRadius = "var(--radius-sm)";
      row.style.border = "1px solid var(--glass-border-subtle)";
      row.innerHTML = `
        <span style="font-size: 0.85rem; font-weight: 500;">Take #${index + 1} (${take.length} frames)</span>
        <button class="btn-apple btn-glass" style="padding: 2px 8px; font-size: 0.72rem; color: var(--apple-red);">Delete</button>
      `;

      row.querySelector("button").onclick = () => {
        takes.splice(index, 1);
        if (!takes.length) delete db[clean];
        saveDb();
        renderTakesForSign(clean);
      };

      takesList.appendChild(row);
    });
  }

  signInput.oninput = () => {
    renderTakesForSign(signInput.value.trim());
  };

  /* ---------- MediaPipe Landmarker Setup with GPU & CPU Fallback ---------- */
  async function ensureLandmarker() {
    if (landmarker) return;
    setStatus("Loading AI Hand Model...", true);
    const vision = await import(VISION_CDN);
    const wasmFileset = await vision.FilesetResolver.forVisionTasks(VISION_CDN + "/wasm");
    try {
      landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2
      });
      setStatus("AI Hand Model Active (GPU)", true);
    } catch (gpuErr) {
      console.warn("GPU delegate failed, falling back to CPU delegate:", gpuErr);
      landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2
      });
      setStatus("AI Hand Model Active (CPU)", true);
    }
  }

  /* ---------- Camera Control (Phone & Desktop) ---------- */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera requires HTTPS or localhost (Secure Context).");
    }

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    const isUser = facingMode === "user";
    if (stageContainer) stageContainer.classList.toggle("mirror", isUser);

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
    } catch (err) {
      console.warn("Retrying with flexible constraints...", err);
      // Fallback for phones with strict constraint matching
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false
      });
    }

    video.srcObject = stream;
    await video.play();
    setStatus("Studio Camera Active", true);
  }

  if (btnFlipCamStudio) {
    btnFlipCamStudio.onclick = async () => {
      facingMode = facingMode === "user" ? "environment" : "user";
      if (running) {
        setStatus(`Switching to ${facingMode === "user" ? "Front" : "Rear"} Camera...`, true);
        await startCamera();
      } else {
        setStatus(`Camera mode: ${facingMode === "user" ? "Front" : "Rear"}`, true);
      }
    };
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detectedHandBadge.textContent = "👋 Hand: None";
    detectedHandBadge.style.color = "var(--text-tertiary)";
  }

  async function start() {
    running = true;
    $("#btnToggleCamera").textContent = "Stop Camera";
    $("#btnToggleCamera").classList.add("stop");
    try {
      await startCamera();
      await ensureLandmarker();
      tick();
    } catch (e) {
      setStatus("Error: " + e.message, false);
      stop();
    }
  }

  function stop() {
    running = false;
    stopCamera();
    $("#btnToggleCamera").textContent = "Start Studio Camera";
    $("#btnToggleCamera").classList.remove("stop");
    setStatus("Camera Ready", false);
  }

  $("#btnToggleCamera").onclick = () => running ? stop() : start();

  /* ---------- Frame Loop with Left/Right Correction & Phone Support ---------- */
  function tick() {
    if (!running) return;

    try {
      if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      frameCount++;
      const now = performance.now();
      if (now - fpsTimer >= 1000) {
        const fpsEl = $("#fpsCount");
        if (fpsEl) fpsEl.textContent = `${frameCount} FPS`;
        frameCount = 0;
        fpsTimer = now;
      }

      if (landmarker && video.readyState >= 2) {
        lastTs = Math.max(Math.floor(performance.now()), lastTs + 1);
        const results = landmarker.detectForVideo(video, lastTs);
        const isMirrored = facingMode === "user";

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const showSkeleton = $("#chkSkeleton") ? $("#chkSkeleton").checked : true;
        if (showSkeleton && results.landmarks) {
          C.drawSkeleton(ctx, results.landmarks, results.handedness, canvas.width, canvas.height, isMirrored);
        }

        // Update Detected Hand Badge
        if (results.landmarks && results.landmarks.length) {
          const detectedSides = results.landmarks.map((_, i) => {
            const rawSide = results.handedness && results.handedness[i] && results.handedness[i][0]
              ? results.handedness[i][0].categoryName
              : "Right";
            return C.resolveHandSide(rawSide);
          });

          if (detectedSides.length >= 2) {
            detectedHandBadge.textContent = "👋 Hands: Both (L + R)";
            detectedHandBadge.style.color = "var(--apple-purple)";
          } else {
            const side = detectedSides[0];
            detectedHandBadge.textContent = `👋 Hand: ${side}`;
            detectedHandBadge.style.color = side === "Right" ? "var(--apple-blue)" : "var(--apple-green)";
          }
        } else {
          detectedHandBadge.textContent = "👋 Hand: None";
          detectedHandBadge.style.color = "var(--text-tertiary)";
        }

        // Record frames if active
        if (recording) {
          const hands = (results.landmarks || []).map((pts, i) => ({
            pts,
            side: results.handedness && results.handedness[i] && results.handedness[i][0]
              ? results.handedness[i][0].categoryName
              : "Right"
          }));

          const vec = C.featurize(hands);
          if (vec) {
            recording.frames.push(vec);
            setStatus(`Recording “${recording.label}” (${recording.frames.length}/40 frames)`, true);
            if (recording.frames.length >= 40) {
              db[recording.label] = db[recording.label] || [];
              db[recording.label].push(recording.frames);
              saveDb();
              setStatus(`Successfully saved take for “${recording.label}”!`, true);
              renderTakesForSign(recording.label);
              recording = null;
            }
          } else {
            setStatus("Show your hand clearly to record...", true);
          }
        }
      }
    } catch (frameErr) {
      console.error("Frame processing error:", frameErr);
    }

    if (running) {
      requestAnimationFrame(tick);
    }
  }

  /* ---------- Record Gesture with 3s Countdown ---------- */
  $("#btnRecordBurst").onclick = () => {
    const label = signInput.value.trim();
    if (!label) {
      alert("Please enter or select a sign name first!");
      signInput.focus();
      return;
    }
    if (!running) {
      alert("Please start the Studio Camera first!");
      return;
    }

    let count = 3;
    const overlay = $("#countdownOverlay");
    overlay.textContent = count;
    overlay.classList.add("active");

    countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        overlay.textContent = count;
      } else {
        clearInterval(countdownInterval);
        overlay.classList.remove("active");
        recording = { label, frames: [] };
        statusText.textContent = `Capturing pose for “${label}”... Hold still!`;
      }
    }, 800);
  };

  // Init
  initCategories();

  const urlParamSign = new URLSearchParams(window.location.search).get("sign");
  if (urlParamSign) {
    signInput.value = decodeURIComponent(urlParamSign);
  }
  renderTakesForSign(signInput.value || "A");
})();
