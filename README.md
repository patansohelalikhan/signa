# Signa AI - Apple-Style Real-Time ASL Translator & Gesture Studio (v3.4)

A minimalist, frosted-glass web application engineered with Apple design principles for real-time American Sign Language (ASL) translation, pictorial biomechanical hand tracking, 1,200+ word vocabulary, and smart sentence synthesis.

---

## 🌟 What's New in v3.4

1. **Fixed Training Studio Camera**:
   - Resolved the crash caused by an undefined DOM selector (`#chkMirrorCorrect`) in the animation loop.
   - Added automatic **GPU-to-CPU delegate fallback** in MediaPipe HandLandmarker so training and tracking work reliably across all GPUs and mobile chips.
   - Enhanced camera initialization with flexible constraints and `webkit-playsinline` for seamless streaming on both desktop and mobile devices.

2. **Full Phone (Mobile) & Desktop Compatibility**:
   - **Compact Mobile Layout**: Balanced responsive navigation tabs, responsive 4:5 camera viewport, and horizontally scrollable control docks with hidden scrollbars.
   - **Phone Camera Switching (📷 Flip Cam)**: Seamless toggle between front selfie camera (auto-mirrored) and rear environmental camera without hand inversion errors.
   - **Touch Feedback & Safe Area Insets**: Native touch feedback, safe area insets for notched devices, and responsive tables/charts that never overflow horizontally on narrow screens (< 400px).

3. **Universal Synchronized Theme System**:
   - Centralized theme controller (`SignaCore.Theme` in `core.js`) synchronized via both `BroadcastChannel` and `localStorage` `storage` events.
   - Fixed raw string vs JSON-stringified storage mismatch that previously prevented theme changes from propagating across pages.
   - Changing the theme on any page (`index.html`, `train.html`, `analyze.html`, or `vocabulary.html`) or in the Preferences modal immediately updates all open tabs without delay or flash.

---

## 🌟 Features from v3.2 & v3.3

1. **Fixed Left/Right Hand Confusion & No-Output Bug**:
   - Added selfie/front camera mirror-aware handedness correction.
   - Ambidextrous single-hand matching: gestures now match accurately whether signed with the **Right hand or Left hand**!
   - Real-time on-screen Hand Telemetry badge (`👋 Hand: Right` in blue, `👋 Hand: Left` in green, `👋 Hands: Both (L + R)` in purple).

2. **Fixed Training Camera Preview**:
   - Resolved the persistent overlay issue where "3" covered the camera preview. The countdown overlay now activates only when you press **Record**.

3. **Global Synchronized Theme**:
   - Toggling the Dark/Light theme on any page automatically updates all open pages and persists instantly without flash of unstyled theme.

4. **Biomechanical Tracking & Real-Time Accuracy Graphs (`analyze.html`)**:
   - **Interactive Anatomical Hand Visualizer**: Live SVG skeleton showing bone links and joints.
   - **5 Finger Extension Gauges**: Real-time Apple Activity-style bars for Thumb, Index, Middle, Ring, and Pinky (0–100%).
   - **Category Accuracy Bar Chart**: Visual comparison of gesture discrimination across Alphabet, Numbers, Greetings, Verbs, etc.
   - **Real-Time Confidence Stream Graph**: Live streaming line chart plotting detection confidence as you sign.

5. **Expansive 1,200+ ASL Vocabulary Bank (`vocabulary.html` & `train.html`)**:
   - Expanded dictionary to over 1,200 categorized terms with multi-lingual translations (English, Hindi, Telugu, Tamil, Spanish).
   - Dynamic category filter in the Gesture Training Studio to pick and train any word from the 1,200-word bank.

6. **Smart Sentence Synthesis (`grammar.js`)**:
   - Automatically converts ASL gloss sequences into fluent spoken sentences (e.g., signing `NAME` + `SOHEL` $\rightarrow$ *"My name is Sohel."*).

---

## 🚀 How to Run

Simply open [**`index.html`**](file:///C:/Users/hariv/signa-ai/index.html) in Google Chrome or Microsoft Edge.
