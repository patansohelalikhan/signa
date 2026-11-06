/**
 * Signa AI - Smart ASL Grammar & Sentence Synthesis Engine
 * Converts raw ASL sign gloss sequences into natural, fluent English and Multilingual sentences.
 * Example: ["name", "sohel"] -> "My name is Sohel."
 */
(function (root) {
  "use strict";

  // Template pattern matching rules
  const RULES = [
    // Name patterns
    {
      match: ["name", "*"],
      synthesize: (tokens) => ({
        en: `My name is ${capitalize(tokens[1])}.`,
        hi: `मेरा नाम ${tokens[1]} है।`,
        te: `నా పేరు ${tokens[1]}.`,
        ta: `என் பெயர் ${tokens[1]}.`,
        es: `Mi nombre es ${capitalize(tokens[1])}.`
      })
    },
    {
      match: ["me", "name", "*"],
      synthesize: (tokens) => ({
        en: `My name is ${capitalize(tokens[2])}.`,
        hi: `मेरा नाम ${tokens[2]} है।`,
        te: `నా పేరు ${tokens[2]}.`,
        ta: `என் பெயர் ${tokens[2]}.`,
        es: `Mi nombre es ${capitalize(tokens[2])}.`
      })
    },
    {
      match: ["your", "name", "*"],
      synthesize: (tokens) => ({
        en: `Your name is ${capitalize(tokens[2])}.`,
        hi: `आपका नाम ${tokens[2]} है।`,
        te: `మీ పేరు ${tokens[2]}.`,
        ta: `உங்கள் பெயர் ${tokens[2]}.`,
        es: `Tu nombre es ${capitalize(tokens[2])}.`
      })
    },
    {
      match: ["you", "name", "what"],
      synthesize: () => ({
        en: "What is your name?",
        hi: "आपका नाम क्या है?",
        te: "మీ పేరు ఏమిటి?",
        ta: "உங்கள் பெயர் என்ன?",
        es: "¿Cómo te llamas?"
      })
    },
    {
      match: ["name", "what"],
      synthesize: () => ({
        en: "What is your name?",
        hi: "आपका नाम क्या है?",
        te: "మీ పేరు ఏమిటి?",
        ta: "உங்கள் பெயர் என்ன?",
        es: "¿Cuál es tu nombre?"
      })
    },

    // Greetings
    {
      match: ["nice", "meet", "you"],
      synthesize: () => ({
        en: "Nice to meet you.",
        hi: "आपसे मिलकर खुशी हुई।",
        te: "మిమ్మల్ని కలవడం ఆనందంగా ఉంది.",
        ta: "உங்களை சந்தித்ததில் மகிழ்ச்சி.",
        es: "Mucho gusto en conocerte."
      })
    },
    {
      match: ["how", "you"],
      synthesize: () => ({
        en: "How are you doing?",
        hi: "आप कैसे हैं?",
        te: "మీరు ఎలా ఉన్నారు?",
        ta: "நீங்கள் எப்படி இருக்கிறீர்கள்?",
        es: "¿Cómo estás?"
      })
    },
    {
      match: ["see", "you", "later"],
      synthesize: () => ({
        en: "See you later!",
        hi: "फिर मिलेंगे!",
        te: "మళ్ళీ కలుద్దాం!",
        ta: "பிறகு சந்திப்போம்!",
        es: "¡Hasta luego!"
      })
    },

    // Needs & Desires
    {
      match: ["want", "water"],
      synthesize: () => ({
        en: "I want water, please.",
        hi: "मुझे पानी चाहिए।",
        te: "నాకు నీరు కావాలి.",
        ta: "எனக்கு தண்ணீர் வேண்டும்.",
        es: "Quiero agua, por favor."
      })
    },
    {
      match: ["me", "want", "water"],
      synthesize: () => ({
        en: "I want water, please.",
        hi: "मुझे पानी चाहिए।",
        te: "నాకు నీరు కావాలి.",
        ta: "எனக்கு தண்ணீர் வேண்டும்.",
        es: "Quiero agua, por favor."
      })
    },
    {
      match: ["need", "help"],
      synthesize: () => ({
        en: "I need help.",
        hi: "मुझे मदद चाहिए।",
        te: "నాకు సహాయం కావాలి.",
        ta: "எனக்கு உதவி தேவை.",
        es: "Necesito ayuda."
      })
    },
    {
      match: ["me", "need", "help"],
      synthesize: () => ({
        en: "I need help right now.",
        hi: "मुझे तुरंत मदद चाहिए।",
        te: "నాకు ఇప్పుడు సహాయం కావాలి.",
        ta: "எனக்கு இப்போது உதவி தேவை.",
        es: "Necesito ayuda de inmediato."
      })
    },
    {
      match: ["want", "food"],
      synthesize: () => ({
        en: "I am hungry and would like some food.",
        hi: "मुझे खाना चाहिए।",
        te: "నాకు ఆహారం కావాలి.",
        ta: "எனக்கு உணவு வேண்டும்.",
        es: "Quiero comida, tengo hambre."
      })
    },

    // Questions & Places
    {
      match: ["where", "bathroom"],
      synthesize: () => ({
        en: "Where is the bathroom?",
        hi: "बाथरूम कहाँ है?",
        te: "బాత్రూమ్ ఎక్కడ ఉంది?",
        ta: "கழிப்பறை எங்கே உள்ளது?",
        es: "¿Dónde está el baño?"
      })
    },
    {
      match: ["where", "hospital"],
      synthesize: () => ({
        en: "Where is the nearest hospital?",
        hi: "नज़दीकी अस्पताल कहाँ है?",
        te: "దగ్గరి ఆసుపత్రి ఎక్కడ ఉంది?",
        ta: "அருகிலுள்ள மருத்துவமனை எங்கே?",
        es: "¿Dónde está el hospital más cercano?"
      })
    },
    {
      match: ["where", "*"],
      synthesize: (tokens) => ({
        en: `Where is the ${tokens[1]}?`,
        hi: `${tokens[1]} कहाँ है?`,
        te: `${tokens[1]} ఎక్కడ ఉంది?`,
        ta: `${tokens[1]} எங்கே?`,
        es: `¿Dónde está ${tokens[1]}?`
      })
    },

    // Emergency
    {
      match: ["call", "police"],
      synthesize: () => ({
        en: "Please call the police immediately!",
        hi: "कृपया तुरंत पुलिस को बुलाएँ!",
        te: "దయచేసి వెంటనే పోలీసులకు కాల్ చేయండి!",
        ta: "தயவுசெய்து உடனடியாக போலீஸை அழையுங்கள்!",
        es: "¡Por favor llame a la policía de inmediato!"
      })
    },
    {
      match: ["call", "doctor"],
      synthesize: () => ({
        en: "Please call a doctor.",
        hi: "कृपया डॉक्टर को बुलाएँ।",
        te: "దయచేసి డాక్టర్‌ని పిలవండి.",
        ta: "மருத்துவரை அழையுங்கள்.",
        es: "Por favor llame a un médico."
      })
    },

    // Emotions
    {
      match: ["me", "feel", "sick"],
      synthesize: () => ({
        en: "I am feeling sick.",
        hi: "मेरी तबीयत ठीक नहीं है।",
        te: "నాకు అనారోగ్యంగా ఉంది.",
        ta: "எனக்கு உடல்நிலை சரியில்லை.",
        es: "Me siento enfermo."
      })
    },
    {
      match: ["i", "love", "you"],
      synthesize: () => ({
        en: "I love you!",
        hi: "मैं तुमसे प्यार करता हूँ!",
        te: "నేను నిన్ను ప్రేమిస్తున్నాను!",
        ta: "நான் உன்னை காதலிக்கிறேன்!",
        es: "¡Te amo!"
      })
    }
  ];

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function matchesRule(tokens, pattern) {
    if (tokens.length !== pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === "*") continue;
      if (pattern[i].toLowerCase() !== tokens[i].toLowerCase()) return false;
    }
    return true;
  }

  /**
   * Synthesize a list of ASL glosses into a fluent sentence
   * @param {string[]} glosses - array of detected sign names e.g. ["name", "sohel"]
   * @param {string} targetLang - "en" | "hi" | "te" | "ta" | "es"
   */
  function synthesizeSentence(glosses, targetLang = "en") {
    if (!glosses || !glosses.length) {
      return { text: "", raw: "" };
    }

    const cleanTokens = glosses.map(g => g.trim().toLowerCase()).filter(Boolean);
    if (!cleanTokens.length) return { text: "", raw: "" };

    // Check sliding window across tokens for multi-token match
    for (let len = Math.min(cleanTokens.length, 4); len >= 2; len--) {
      const windowTokens = cleanTokens.slice(-len);
      for (const rule of RULES) {
        if (matchesRule(windowTokens, rule.match)) {
          const res = rule.synthesize(windowTokens);
          return {
            text: res[targetLang] || res.en,
            en: res.en,
            raw: glosses.join(" ")
          };
        }
      }
    }

    // Single sign fallback
    const lastWord = glosses[glosses.length - 1];
    return {
      text: capitalize(lastWord),
      en: capitalize(lastWord),
      raw: glosses.join(" ")
    };
  }

  root.SignaGrammar = {
    synthesizeSentence,
    RULES
  };

})(typeof window !== "undefined" ? window : globalThis);
