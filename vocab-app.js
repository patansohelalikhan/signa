"use strict";

/**
 * Signa - 1,200+ ASL Vocabulary Catalog & Translation Manager (v3.2)
 */
(function () {
  const Dict = window.ASL_DICTIONARY;

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
  const customVocab = LS("signa_custom_vocab_v3", {});
  const userAddedWords = LS("signa_user_words_v3", []);

  // Merge any user-created words into Dict.WORDS
  userAddedWords.forEach(w => {
    if (!Dict.WORDS.some(x => x.en.toLowerCase() === w.en.toLowerCase())) {
      Dict.WORDS.unshift(w);
      Dict.MAP[w.en.toLowerCase()] = w;
    }
  });

  let activeCategory = "all";
  let searchQuery = "";

  const tableBody = $("#vocabTableBody");
  const searchInput = $("#searchVocabInput");
  const catButtons = [...$("#categoryFilter").children];
  const totalCountBadge = $("#totalCountBadge");
  const addModal = $("#addWordModal");
  const btnOpenAddSignModal = $("#btnOpenAddSignModal");
  const btnSaveNewWord = $("#btnSaveNewWord");

  if (btnOpenAddSignModal) {
    btnOpenAddSignModal.onclick = () => {
      $("#newWordEn").value = "";
      $("#newWordHi").value = "";
      $("#newWordTe").value = "";
      $("#newWordTa").value = "";
      $("#newWordEs").value = "";
      addModal.showModal();
    };
  }

  if (btnSaveNewWord) {
    btnSaveNewWord.onclick = () => {
      const en = $("#newWordEn").value.trim();
      if (!en) return;

      const cat = $("#newWordCat").value;
      const hi = $("#newWordHi").value.trim() || en;
      const te = $("#newWordTe").value.trim() || en;
      const ta = $("#newWordTa").value.trim() || en;
      const es = $("#newWordEs").value.trim() || en;

      const newWord = { en, cat, hi, te, ta, es };
      userAddedWords.unshift(newWord);
      saveLS("signa_user_words_v3", userAddedWords);

      Dict.WORDS.unshift(newWord);
      Dict.MAP[en.toLowerCase()] = newWord;

      renderTable();
    };
  }

  // Theme is handled globally by SignaCore.Theme in core.js

  // Render Table Rows
  function renderTable() {
    tableBody.innerHTML = "";
    const q = searchQuery.toLowerCase().trim();

    const filtered = Dict.WORDS.filter(w => {
      const matchesCat = activeCategory === "all" || w.cat.includes(activeCategory);
      if (!matchesCat) return false;

      if (!q) return true;
      const k = w.en.toLowerCase();
      const custom = customVocab[k] || {};
      const hi = custom.hi || w.hi || "";
      const te = custom.te || w.te || "";
      const ta = custom.ta || w.ta || "";
      const es = custom.es || w.es || "";

      return (
        w.en.toLowerCase().includes(q) ||
        hi.includes(q) ||
        te.includes(q) ||
        ta.includes(q) ||
        es.toLowerCase().includes(q)
      );
    });

    totalCountBadge.textContent = `${filtered.length} Signs Displayed (of ${Dict.count})`;

    // Render smooth slice (200 items max at once for fast scroll)
    const renderLimit = Math.min(filtered.length, 200);

    for (let i = 0; i < renderLimit; i++) {
      const w = filtered[i];
      const k = w.en.toLowerCase();
      const c = customVocab[k] || {};

      const hi = c.hi !== undefined ? c.hi : w.hi || "";
      const te = c.te !== undefined ? c.te : w.te || "";
      const ta = c.ta !== undefined ? c.ta : w.ta || "";
      const es = c.es !== undefined ? c.es : w.es || "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--apple-blue);">${w.en}</td>
        <td><span class="apple-chip" style="font-size: 0.72rem;">${w.cat}</span></td>
        <td contenteditable="true" data-field="hi">${hi}</td>
        <td contenteditable="true" data-field="te">${te}</td>
        <td contenteditable="true" data-field="ta">${ta}</td>
        <td contenteditable="true" data-field="es">${es}</td>
        <td style="text-align: center;">
          <a href="train.html?sign=${encodeURIComponent(w.en)}" class="btn-apple btn-glass" style="padding: 2px 8px; font-size: 0.75rem; text-decoration: none;">
            Train
          </a>
        </td>
      `;

      tr.querySelectorAll("[contenteditable]").forEach(cell => {
        cell.onblur = () => {
          const field = cell.dataset.field;
          const val = cell.textContent.trim();
          customVocab[k] = customVocab[k] || Object.assign({}, w);
          customVocab[k][field] = val;
          saveLS("signa_custom_vocab_v3", customVocab);
        };
      });

      tableBody.appendChild(tr);
    }

    if (!filtered.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-tertiary); padding: 2rem;">
            No signs found matching “${q}”.
          </td>
        </tr>
      `;
    }
  }

  // Search Filter
  searchInput.oninput = (e) => {
    searchQuery = e.target.value;
    renderTable();
  };

  // Category Filter
  catButtons.forEach(btn => {
    btn.onclick = () => {
      catButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.cat;
      renderTable();
    };
  });

  // Init
  renderTable();
})();
