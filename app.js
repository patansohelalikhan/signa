"use strict";

/**
 * Signa - Main Translate Engine & Apple UI Controller (v3.3)
 * Dynamic Hand Inversion, Phone Camera Switching (Front/Rear), and Windows Theme Sync
 */
(function () {
  const C = window.SignaCore;
  const ASL = window.ASLDataset;
  const Dict = window.ASL_DICTIONARY;
  const Grammar = window.SignaGrammar;

  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

  const DEF_MODEL = "gemini-2.5-flash";

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

  // Config
  const cfg = Object.assign(
    {
      key: "",
      model: DEF_MODEL,
      strict: 2.4,
      rate: 1.0,
      mute: false,
      out: "en"
    },
    LS("signa_cfg_v3", {})
  );

  // Load ASL dataset
  let db = (() => {
    const raw = LS("signa_asl_db_v3", null);
    if (!raw) {
      const initial = ASL.generateDefaultDatabase();
      const serialized = {};
      for (const k in initial) {
        serialized[k] = initial[k].map(take => take.map(v => Array.from(v)));
      }
      saveLS("signa_asl_db_v3", serialized);
      return initial;
    }
    const hydrated = {};
    for (const L in raw) {
      hydrated[L] = raw[L].map(take => take.map(a => Float32Array.from(a)));
    }
    return hydrated;
  })();

  // State
  let running = false;
  let paused = false;
  let landmarker = null;
  let stream = null;
  let lastTs = 0;
  let lastSpoken = "";
  let facingMode = "user"; // "user" (front) or "environment" (rear)
  const recentGlosses = [];
  let glossExpiryTimer = null;
  const fullHistory = [];
  const smoother = C.makeSmoother(6, 3);

  // DOM Elements
  const video = $("#video");
  const canvas = $("#canvasOverlay");
  const ctx = canvas.getContext("2d");
  const pulseDot = $("#pulseDot");
  const cameraStatusText = $("#cameraStatusText");
  const handSideLabel = $("#handSideLabel");
  const btnQuickSwapHands = $("#btnQuickSwapHands");
  const displaySentence = $("#displaySentence");
  const displaySubtext = $("#displaySubtext");
  const historyText = $("#historyText");
  const stageContainer = $("#stageContainer");

  // Synchronized Windows / OS Theme Management handled globally by SignaCore.Theme
  window.addEventListener("storage", (e) => {
    if (e.key === "signa_flip_hands") updateHandBadgeUI();
  });

  // 1-Click Left/Right Hand Swap
  function updateHandBadgeUI() {
    const inverted = C.shouldInvertHands();
    btnQuickSwapHands.style.background = inverted ? "var(--apple-blue)" : "rgba(255,255,255,0.18)";
  }

  btnQuickSwapHands.onclick = (e) => {
    e.stopPropagation();
    const cur = C.shouldInvertHands();
    C.setInvertHands(!cur);
    updateHandBadgeUI();
    setStatus(`Hand orientation set to: ${!cur ? "Inverted" : "Normal"}`, true);
  };

  // Language Selector
  const langButtons = [...$("#langSelector").children];
  langButtons.forEach(btn => {
    btn.onclick = () => {
      langButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      cfg.out = btn.dataset.lang;
      saveLS("signa_cfg_v3", cfg);
      updateSynthesizedDisplay();
    };
    if (btn.dataset.lang === cfg.out) {
      langButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    }
  });

  function setStatus(msg, isSuccess = true) {
    cameraStatusText.textContent = msg;
    pulseDot.style.background = isSuccess ? "var(--apple-green)" : "var(--apple-red)";
    pulseDot.style.boxShadow = `0 0 10px ${isSuccess ? "var(--apple-green)" : "var(--apple-red)"}`;
  }

  /* ---------- MediaPipe Landmarker Setup ---------- */
  async function ensureLandmarker() {
    if (landmarker) return;
    setStatus("Loading AI Hand Model...", true);
    const vision = await import(VISION_CDN);
    const wasmFileset = await vision.FilesetResolver.forVisionTasks(VISION_CDN + "/wasm");
    try {
      landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      setStatus("AI Hand Model Active (GPU)", true);
    } catch (gpuErr) {
      console.warn("GPU delegate failed, falling back to CPU delegate:", gpuErr);
      landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      setStatus("AI Hand Model Active (CPU)", true);
    }
  }

  /* ---------- Camera Management (Phone & Desktop) ---------- */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera requires HTTPS or localhost (Secure Context)");
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    const isUser = facingMode === "user";
    stageContainer.classList.toggle("mirror", isUser);

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 960 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (err) {
      console.warn("Retrying with flexible constraints...", err);
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false
      });
    }

    video.srcObject = stream;
    await video.play();
    setStatus("Camera Tracking Active", true);
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    handSideLabel.textContent = "👋 Hand: None";
  }

  async function start() {
    running = true;
    paused = false;
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
    $("#btnToggleCamera").textContent = "Start Camera";
    $("#btnToggleCamera").classList.remove("stop");
    setStatus("Camera Ready", false);
  }

  $("#btnToggleCamera").onclick = () => running ? stop() : start();

  // Flip Camera (Front / Rear for Phones)
  $("#btnFlipCamera").onclick = async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    if (running) {
      setStatus(`Switching to ${facingMode === "user" ? "Front" : "Rear"} Camera...`, true);
      await startCamera();
    } else {
      setStatus(`Camera mode set to: ${facingMode === "user" ? "Front" : "Rear"}`, true);
    }
  };

  $("#btnPauseCamera").onclick = () => {
    paused = !paused;
    $("#btnPauseCamera").textContent = paused ? "Resume" : "Pause";
    setStatus(paused ? "Paused" : "Tracking Active", true);
  };
  $("#btnClearCurrent").onclick = () => {
    recentGlosses.length = 0;
    smoother.reset();
    displaySentence.textContent = "—";
    displaySubtext.textContent = "Start signing in camera view";
    setStatus("Reset complete", true);
  };
  $("#btnSpeakNow").onclick = () => {
    const text = displaySentence.textContent;
    if (text && text !== "—") speak(text, cfg.out, true);
  };

  /* ---------- Main Loop with Resolved Hand Detection ---------- */
  let lastProcessTime = 0;
  function tick() {
    if (!running) return;

    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;
    if (canvas.width !== vW || canvas.height !== vH) {
      canvas.width = vW;
      canvas.height = vH;
    }

    const now = performance.now();
    if (!paused && now - lastProcessTime >= 50) { // 20 FPS processing rate
      lastProcessTime = now;
      processFrame();
    }

    requestAnimationFrame(tick);
  }

  function processFrame() {
    if (!landmarker || video.readyState < 2) return;

    lastTs = Math.max(Math.floor(performance.now()), lastTs + 1);
    const results = landmarker.detectForVideo(video, lastTs);
    const isMirrored = facingMode === "user";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (results.landmarks) {
      C.drawSkeleton(ctx, results.landmarks, results.handedness, canvas.width, canvas.height, isMirrored);
    }

    // Hand detection & Left/Right telemetry badge
    if (results.landmarks && results.landmarks.length) {
      const detectedSides = results.landmarks.map((_, i) => {
        const rawSide = results.handedness && results.handedness[i] && results.handedness[i][0]
          ? results.handedness[i][0].categoryName
          : "Right";
        return C.resolveHandSide(rawSide);
      });

      if (detectedSides.length >= 2) {
        handSideLabel.textContent = "👋 Hands: Both (L + R)";
        handSideLabel.style.color = "var(--apple-purple)";
      } else {
        const side = detectedSides[0];
        handSideLabel.textContent = `👋 Hand: ${side}`;
        handSideLabel.style.color = side === "Right" ? "var(--apple-blue)" : "var(--apple-green)";
      }
    } else {
      handSideLabel.textContent = "👋 Hand: None";
      handSideLabel.style.color = "var(--text-tertiary)";
      smoother.add(null);
      return;
    }

    // Featurize with resolved side
    const hands = results.landmarks.map((pts, i) => {
      const rawSide = results.handedness && results.handedness[i] && results.handedness[i][0]
        ? results.handedness[i][0].categoryName
        : "Right";
      return { pts, side: rawSide };
    });

    const vec = C.featurize(hands);
    if (!vec) {
      smoother.add(null);
      return;
    }

    const decision = C.decide(C.perClass(vec, db), cfg.strict);
    if (decision.status === "ok") {
      const smoothed = smoother.add(decision.label);
      if (smoothed) {
        onSignDetected(smoothed, decision.confidence);
      }
    }
  }

  /* ---------- Smart Sentence Synthesis (Grammar) ---------- */
  function onSignDetected(signName, confidence) {
    if (recentGlosses[recentGlosses.length - 1] !== signName) {
      recentGlosses.push(signName);
    }

    clearTimeout(glossExpiryTimer);
    glossExpiryTimer = setTimeout(() => {
      const finalSynthesis = Grammar.synthesizeSentence(recentGlosses, cfg.out);
      if (finalSynthesis && finalSynthesis.text) {
        pushHistory(finalSynthesis.text);
      }
      recentGlosses.length = 0;
    }, 3500);

    updateSynthesizedDisplay(confidence);
  }

  function updateSynthesizedDisplay(confidence = 90) {
    if (!recentGlosses.length) return;

    const synthesized = Grammar.synthesizeSentence(recentGlosses, cfg.out);
    displaySentence.textContent = synthesized.text;

    const dictItem = Dict.MAP[recentGlosses[recentGlosses.length - 1].toLowerCase()];
    const nativeWord = (dictItem && dictItem[cfg.out]) || synthesized.text;

    if (cfg.out !== "en") {
      displaySubtext.textContent = `${nativeWord} · (English: ${synthesized.en}) · ${confidence}% Match`;
    } else {
      displaySubtext.textContent = `Raw Signs: ${synthesized.raw} · ${confidence}% Match`;
    }

    speak(synthesized.text, cfg.out);
  }

  /* ---------- Speech Synthesis ---------- */
  function speak(text, langCode = "en", force = false) {
    if (!text || cfg.mute) return;
    if (!("speechSynthesis" in window)) return;
    if (!force && text === lastSpoken) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = cfg.rate || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase().startsWith(langCode));
    if (voice) u.voice = voice;

    window.speechSynthesis.speak(u);
    lastSpoken = text;
  }

  function pushHistory(sentence) {
    if (!sentence || fullHistory[fullHistory.length - 1] === sentence) return;
    fullHistory.push(sentence);
    if (fullHistory.length > 50) fullHistory.shift();
    historyText.textContent = fullHistory.join("  •  ");
  }

  $("#btnCopyHistory").onclick = () => {
    if (!fullHistory.length) return;
    navigator.clipboard.writeText(fullHistory.join(" "));
    setStatus("History copied to clipboard!", true);
  };

  $("#btnClearHistory").onclick = () => {
    fullHistory.length = 0;
    historyText.textContent = "History cleared.";
  };

  /* ---------- Preferences Modal Handlers ---------- */
  const modal = $("#settingsModal");
  $("#btnSettingsOpen").onclick = () => {
    $("#cfgThemeSelect").value = localStorage.getItem("signa_theme") || "system";
    $("#cfgInvertHands").checked = C.shouldInvertHands();
    $("#cfgKey").value = cfg.key;
    $("#cfgModel").value = cfg.model;
    $("#cfgStrict").value = cfg.strict;
    $("#cfgRate").value = cfg.rate;
    $("#cfgMute").checked = cfg.mute;
    modal.showModal();
  };

  $("#btnSaveConfig").onclick = () => {
    const chosenTheme = $("#cfgThemeSelect").value;
    C.Theme.set(chosenTheme);

    C.setInvertHands($("#cfgInvertHands").checked);
    updateHandBadgeUI();

    cfg.key = $("#cfgKey").value.trim();
    cfg.model = $("#cfgModel").value.trim() || DEF_MODEL;
    cfg.strict = parseFloat($("#cfgStrict").value) || 2.4;
    cfg.rate = parseFloat($("#cfgRate").value) || 1.0;
    cfg.mute = $("#cfgMute").checked;
    saveLS("signa_cfg_v3", cfg);
    setStatus("Preferences saved", true);
  };

  $("#btnVerifyKey").onclick = async () => {
    const key = $("#cfgKey").value.trim();
    const statusBox = $("#keyVerificationStatus");
    if (!key) {
      statusBox.textContent = "Please enter an API key first.";
      statusBox.style.color = "var(--apple-red)";
      return;
    }
    statusBox.textContent = "Testing connection with Google AI Studio...";
    statusBox.style.color = "var(--text-secondary)";

    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": key }
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " (Invalid API Key)");
      const json = await res.json();
      const flashModels = (json.models || [])
        .map(m => m.name.replace(/^models\//, ""))
        .filter(n => /flash/.test(n));

      statusBox.textContent = `✓ Key is valid! Usable models: ${flashModels.slice(0, 3).join(", ")}`;
      statusBox.style.color = "var(--apple-green)";
      if (flashModels.length) $("#cfgModel").value = flashModels[0];
    } catch (err) {
      statusBox.textContent = "Verification error: " + err.message;
      statusBox.style.color = "var(--apple-red)";
    }
  };

  // Init
  applyTheme();
  updateHandBadgeUI();
})();
