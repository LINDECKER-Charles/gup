/**
 * Hindi catalog, translated from en.js (the source) into standard Hindi in
 * Devanagari, formal *आप*. Everyday tech words stay in their common Hindi
 * loan form (अपडेट, स्कैन, कमांड — feminine); sentences end with the danda
 * (tested). स्रोत does not inflect after a numeral, so no plural object.
 * Format and rules: see en.js.
 */
export default {
  meta: {
    title: "gup — एक कमांड से winget, brew, npm और pip अपडेट करें",
    description:
      "मुफ़्त और ओपन सोर्स CLI, जो एक फ़ुल-स्क्रीन टर्मिनल ऐप से {providers} स्रोतों — winget, " +
      "scoop, Homebrew, npm, pip, cargo, helm — को स्कैन और अपडेट करता है।",
    ogTitle: "gup — एक कमांड, {providers} स्रोत अप-टू-डेट",
    ogDescription:
      "एक ही बाइनरी winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, kubectl, " +
      "VS Code और JetBrains — कुल {providers} स्रोतों — को समानांतर रूप से स्कैन करती है, और " +
      "आप जो चुनें उसे अपने इंटरफ़ेस से बाहर निकले बिना अपडेट करती है।",
    ogImageAlt:
      "gup — एक कमांड, {providers} स्रोत अप-टू-डेट। winget, Homebrew, npm, pip, cargo और " +
      "helm के लिए ओपन सोर्स CLI।",
    keywords:
      "सभी पैकेज अपडेट करें, पैकेज मैनेजर, winget upgrade, brew upgrade, npm update -g, " +
      "pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, topgrade का विकल्प",
  },
  common: {
    skipLink: "मुख्य सामग्री पर जाएँ",
    home: "gup — होम",
    github: "GitHub पर सोर्स कोड",
    install: "इंस्टॉल करें",
    copy: "कॉपी करें",
    copied: "कॉपी हो गया!",
    copyLabel: "इंस्टॉल कमांड कॉपी करें: {installCommand}",
    copyStatus: "कमांड क्लिपबोर्ड पर कॉपी हो गई",
    copyFailed: "कॉपी नहीं हो सका — कमांड चुनें और खुद कॉपी करें",
    language: "भाषा",
    languageCurrent: "भाषा: {endonym}",
    newBadge: "नया",
    noscript:
      "JavaScript बंद है: पेज पूरी तरह पढ़ा जा सकता है; सिर्फ़ टर्मिनल का रीप्ले और कॉपी बटन " +
      "काम नहीं करेंगे।",
  },
  nav: {
    label: "पेज के अनुभाग",
    features: "सुविधाएँ",
    coverage: "कवरेज",
    how: "कार्यप्रणाली",
    faq: "सामान्य प्रश्न",
  },
  hero: {
    eyebrow: "नया — अपडेट अब इंटरफ़ेस के अंदर ही चलते हैं",
    title: { before: "एक कमांड।", accent: "{providers} स्रोत", after: "हमेशा अप-टू-डेट।" },
    lead:
      "**winget**, **brew**, **npm**, pip, cargo और helm के पीछे अलग-अलग भागना छोड़िए। gup इन " +
      "सबको समानांतर रूप से स्कैन करता है, दिखाता है कि क्या पुराना हो चुका है, और आप जो चुनें " +
      "उसे अपडेट करता है — अपने इंटरफ़ेस से कभी बाहर निकले बिना।",
    secondaryCta: "GitHub पर देखें",
    trust: [
      "MIT · ओपन सोर्स",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "शून्य टेलीमेट्री",
      "कोई डेमन नहीं · शेड्यूलिंग वैकल्पिक",
    ],
    terminal: {
      label: "gup काम करते हुए",
      tabs: { app: "इंटरफ़ेस", update: "अपडेट", json: "JSON" },
      caption: "इंटरफ़ेस फ़्रेंच में है। कमांड, फ़्लैग और JSON आउटपुट हर भाषा में एक जैसे हैं।",
    },
  },
  features: {
    kicker: "01 / सुविधाएँ",
    title: "सब कुछ एक ही इंटरफ़ेस में।",
    lead:
      "स्कैन करें, चुनें, अपडेट करें, शेड्यूल करें और समीक्षा करें — gup आपको एक ही फ़ुल-स्क्रीन " +
      "टर्मिनल ऐप में रखता है।",
    items: {
      inline: {
        title: "gup छोड़े बिना अपडेट",
        text:
          "इंस्टॉलर इंटरफ़ेस में एम्बेड किए गए टर्मिनल पेन में चलते हैं — प्रोग्रेस बार, " +
          "प्रॉम्प्ट और रंग जस के तस। अपडेट हुए पैकेज फिर सूची से हट जाते हैं, दोबारा स्कैन की " +
          "ज़रूरत नहीं। अगर एम्बेडेड टर्मिनल उपलब्ध न हो, तो gup कारण बताता है और आपके अपने " +
          "टर्मिनल में अपडेट करता है।",
      },
      select: {
        title: "कई चुनें, एक बार में चलाएँ",
        text:
          "[[Space]] से पैकेज चुनें, [[a]] से सभी चुनें और [[Enter]] से चलाएँ। एक कतार, एक " +
          "सारांश।",
      },
      schedule: {
        title: "पैकेज-दर-पैकेज निर्धारित अपडेट",
        text:
          "पैकेज चुनें और [[p]] दबाएँ: `ripgrep` हर हफ़्ते अपडेट होगा और `node` जैसा है वैसा " +
          "रहेगा। शेड्यूल पैकेजों को लक्षित करते हैं, कभी पूरे provider को नहीं; आपके OS का " +
          "शेड्यूलर gup को थोड़ी देर के लिए शुरू करता है ताकि जिनका समय हो गया है वे अपडेट चल " +
          "जाएँ, इसलिए बैकग्राउंड में कुछ भी चलता नहीं रहता।",
      },
      journal: {
        title: "गतिविधि लॉग",
        text:
          "हर स्कैन और हर अपडेट आपकी मशीन पर ही लॉग होता है। टर्मिनल चार्ट आपकी गतिविधि दिखाते " +
          "हैं और बताते हैं कि कौन-से पैकेज सबसे ज़्यादा अपडेट होते हैं; डीबग करने के लिए लॉग " +
          "एक्सपोर्ट करें।",
      },
      report: {
        title: "HTML रिपोर्ट",
        text:
          "`gup report`, या गतिविधि लॉग में [[o]], ब्राउज़र में आपके इतिहास की एक साफ़, आसानी " +
          "से नेविगेट होने वाली रिपोर्ट खोलता है — एक ही ऑफ़लाइन फ़ाइल, जिसे कोई भी पढ़ सकता " +
          "है, सिर्फ़ टर्मिनल इस्तेमाल करने वाले ही नहीं।",
      },
      themes: {
        title: "थीम जो हमेशा पढ़ने में आसान रहें",
        text:
          "दस बिल्ट-इन थीम या आपके अपने रंग: gup हर एक को WCAG AA पर परखता है — टेक्स्ट के " +
          "लिए 4.5:1, बॉर्डर के लिए 3:1, AAA चुनने पर 7:1 — और जो कम पड़े उसे ठीक करता है।",
      },
      os: {
        title: "आपके OS को समझता है",
        text:
          "जो providers आपके सिस्टम पर नहीं चल सकते, वे छिपाए नहीं जाते बल्कि धूसर दिखते हैं: " +
          "Mac पर सिर्फ़ Windows वाले टूल वैसे ही दिखते हैं, और इसका उल्टा भी।",
      },
      script: {
        title: "स्क्रिप्ट और CI के लिए बना",
        text:
          "`gup list --json`, स्थिर एग्ज़िट कोड, प्रॉम्प्ट छोड़ने के लिए `-y`, और स्कैन को " +
          "बायपास करने वाले `provider:package` टारगेट।",
      },
    },
  },
  coverage: {
    kicker: "02 / कवरेज",
    title: "{providers} स्रोत। तीन सिस्टम। एक बाइनरी।",
    lead:
      "Windows, macOS और Linux पर एक ही एक्ज़िक्यूटेबल — वही provider अनुबंध, वही JSON। " +
      "बदलती है तो सिर्फ़ OS की वह परत, जिसे gup चला सकता है।",
    delegated: "सौंपा गया",
    supported: "समर्थित providers",
    everywhere: "हर जगह एक जैसा",
    allProviders: "सभी {providers} providers, डोमेन के अनुसार",
    catalogLink: "पूरा provider कैटलॉग देखें",
    platforms: {
      windows: {
        badge: "मुख्य लक्ष्य",
        foot: "WSL ब्रिज: आपके डिस्ट्रो के अंदर apt, dnf, pacman, Flatpak, Nix और Linuxbrew।",
      },
      macos: {
        badge: "नेटिव",
        foot:
          "Apple Silicon और Intel · brew Cellar के सिमलिंक अपने-आप फ़ॉलो किए जाते हैं · `mas` " +
          "वैकल्पिक।",
      },
      linux: {
        badge: "नेटिव",
        foot:
          "किसी बाइनरी का मालिक `dpkg -S` या `rpm -qf` से पता किया जाता है, फिर अपडेट उसी " +
          "मैनेजर को वापस सौंप दिया जाता है।",
      },
    },
    domains: {
      os: "OS पैकेज मैनेजर",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET और PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "अन्य भाषाएँ",
      toolchain: "वर्ज़न मैनेजर",
      cloud: "क्लाउड CLI",
      iac: "इन्फ्रास्ट्रक्चर ऐज़ कोड",
      kubernetes: "Kubernetes",
      containers: "कंटेनर",
      security: "सुरक्षा टूल",
      "dev-cli": "डेवलपर CLI",
      ide: "IDE और एडिटर",
      "editor-plugins": "एडिटर प्लगइन",
      "embedded-mobile": "एम्बेडेड और मोबाइल",
      shell: "शेल और प्रॉम्प्ट",
      self: "gup खुद",
    },
  },
  how: {
    kicker: "03 / कार्यप्रणाली",
    title: "एक ऑर्केस्ट्रेटर, एक और पैकेज मैनेजर नहीं।",
    lead:
      "gup हर टूल की अपनी कमांड समानांतर रूप से चलाता है और जवाबों को एक साथ सजाता है। न कोई " +
      "पैकेज रजिस्ट्री, न कैश, न बैकग्राउंड में चलता कोई प्रोसेस।",
    steps: {
      scan: {
        title: "स्कैन",
        text:
          "हर पहचाना गया provider `listOutdated()` का जवाब देता है, एक बार में चार। कोई विफल हो " +
          "जाए, तो सिर्फ़ उसकी अपनी पंक्ति प्रभावित होती है।",
      },
      choose: {
        title: "चुनें",
        text:
          "provider के अनुसार समूहों में पैकेज देखें, फ़िल्टर करें, चुनें — या " +
          "`gup update brew:fzf` से स्कैन ही छोड़ दें।",
      },
      update: {
        title: "अपडेट",
        text:
          "नेटिव कमांड आर्ग्युमेंट वेक्टर के रूप में चलती हैं, कभी शेल के ज़रिए नहीं। हर प्रयास " +
          "स्थानीय लॉग में दर्ज होता है।",
      },
    },
    docsLink: "आर्किटेक्चर विस्तार से",
  },
  security: {
    kicker: "04 / सुरक्षा",
    title: "यह विशेषाधिकार वाली कमांड चलाता है। इसलिए इसे उसी हिसाब से बनाया गया है।",
    lead:
      "शेल तक पहुँचने का एक ही रास्ता, सख़्त आर्ग्युमेंट वेक्टर, टेस्ट से तय की गई अनुमति-सूची — " +
      "और हर कमिट तीन स्टैटिक एनालाइज़र से होकर गुज़रता है।",
    items: {
      execution: {
        title: "निष्पादन",
        text:
          "सबप्रोसेस सख़्त argv वेक्टर के रूप में चलते हैं, कभी `shell: true` नहीं, और सिर्फ़ " +
          "एक ऑडिट किए गए एंट्री पॉइंट से होकर।",
      },
      supplyChain: {
        title: "सप्लाई चेन",
        text:
          "सिर्फ़ HTTPS से डाउनलोड, हर बिल्ड पर डिपेंडेंसी का ऑडिट, हर हफ़्ते अपडेट की " +
          "समीक्षा।",
      },
      analysis: {
        title: "स्टैटिक विश्लेषण",
        text:
          "हर कमिट पर CodeQL, Semgrep और eslint-plugin-security, साथ में सुरक्षा इनवेरिएंट " +
          "के लिए समर्पित टेस्ट सूट।",
      },
    },
    links: { policy: "सुरक्षा नीति", contributing: "योगदान दें" },
  },
  faq: {
    kicker: "05 / सामान्य प्रश्न",
    title: "आपके सवाल, हमारे जवाब।",
    items: {
      replace: {
        q: "क्या gup, winget, brew या npm की जगह लेता है?",
        a:
          "नहीं। gup हर टूल की नेटिव कमांड (`winget upgrade`, `brew outdated`, " +
          "`npm update -g`, `pip list --outdated`…) को एक ही इंटरफ़ेस के पीछे संचालित करता है। " +
          "न कोई नया प्रोटोकॉल, न वर्ज़न कैश, न कोई सीधा डाउनलोड।",
      },
      platforms: {
        q: "क्या यह macOS और Linux पर चलता है?",
        a:
          "हाँ। macOS पर नेटिव रूप से: Homebrew के फ़ॉर्मूले और कास्क, MacPorts और Mac App " +
          "Store, Apple Silicon और Intel दोनों पर। Linux पर OS-स्तर Homebrew/Linuxbrew और Nix " +
          "संभालते हैं, और डिस्ट्रीब्यूशन से इंस्टॉल हुई बाइनरी `apt` या `dnf` को वापस सौंप दी " +
          "जाती है। OS परत के ऊपर की हर चीज़ — npm, pip, cargo, helm, VS Code… — तीनों सिस्टम " +
          "पर एक जैसा व्यवहार करती है।",
      },
      install: {
        q: "gup कैसे इंस्टॉल करें?",
        a:
          "`{installCommand}` चलाएँ, फिर `gup doctor` से देखें कि कौन-से providers पहचाने " +
          "गए। Node.js {nodeEngine} या उससे नया वर्ज़न ज़रूरी है।",
      },
      ci: {
        q: "क्या gup को CI में इस्तेमाल किया जा सकता है?",
        a:
          "हाँ। `gup list --json --fast` मशीन के पढ़ने लायक आउटपुट देता है और " +
          "`gup update --all -y` हर प्रॉम्प्ट छोड़ देता है। एग्ज़िट कोड स्थिर हैं: `0` सफल, " +
          "`1` आंशिक विफलता, `2` अमान्य आर्ग्युमेंट।",
      },
      count: {
        q: "gup कितने पैकेज मैनेजर कवर करता है?",
        a:
          "{providers} providers, हर एक अलग मॉड्यूल में: winget, scoop, chocolatey, Homebrew, " +
          "MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, dotnet टूल, helm, kubectl, " +
          "terraform, VS Code एक्सटेंशन, JetBrains IDE, WSL डिस्ट्रीब्यूशन और भी बहुत कुछ।",
      },
      security: {
        q: "क्या इसे चलाना सुरक्षित है?",
        a:
          "हर सबप्रोसेस एक ही एंट्री पॉइंट से, सख़्त आर्ग्युमेंट वेक्टर के रूप में गुज़रता है — " +
          "कभी शेल के ज़रिए नहीं — और टेस्ट से तय की गई अनुमति-सूची के साथ। CodeQL, Semgrep, " +
          "gitleaks, audit-ci और Dependabot लगातार चलते हैं। gup कोई टेलीमेट्री नहीं भेजता।",
      },
      topgrade: {
        q: "यह topgrade से कैसे अलग है?",
        a:
          "topgrade सीधे अपडेट चलाता है; gup पहले यह बताता है कि “क्या पुराना है, और किस " +
          "वर्ज़न से किस वर्ज़न तक”। स्कैन एक अलग चरण है, जिसमें JSON आउटपुट, पैकेज-दर-पैकेज " +
          "चयन, `provider:package` टारगेट, हर पैकेज के लिए शेड्यूल और एक स्थानीय इतिहास मिलता " +
          "है, जिसे आप कभी भी देख सकते हैं।",
      },
      language: {
        q: "इंटरफ़ेस किस भाषा में है?",
        a:
          "फ़िलहाल इंटरफ़ेस फ़्रेंच में है। कमांड, फ़्लैग और JSON आउटपुट भाषा पर निर्भर नहीं " +
          "हैं, और यह साइट आठ भाषाओं में उपलब्ध है।",
      },
    },
  },
  install: {
    kicker: "06 / इंस्टॉल",
    title: "तीस सेकंड, और आपको सब पता चल जाएगा।",
    lead: "एक npm इंस्टॉल, एक कमांड, और आपकी मशीन पर जो कुछ पुराना है उसकी पूरी सूची।",
    examples: {
      menu: "फ़ुल-स्क्रीन इंटरफ़ेस",
      listFast: "क्या पुराना है, तेज़ स्कैन",
      updateAll: "सब कुछ, बिना प्रॉम्प्ट (CI)",
      target: "एक पैकेज, बिना स्कैन",
      doctor: "क्या पहचाना गया, और बाकी को कैसे इंस्टॉल करें",
    },
    support: {
      title: "क्या यह आपके काम आया?",
      text:
        "gup मुफ़्त है, MIT लाइसेंस वाला है और मैं इसे अपने खाली समय में मेंटेन करता हूँ। अगर " +
        "इससे आपका समय बचा है, तो एक कॉफ़ी या एक स्टार {providers} providers को आगे बढ़ाते " +
        "रहने में मदद करता है।",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "GitHub पर स्टार दें",
    },
  },
  footer: {
    tagline:
      "Global Updater — {providers} इंस्टॉलेशन स्रोतों के लिए एक CLI। स्ट्रिक्ट TypeScript, " +
      "ESM, Node ≥ {node}।",
    columns: { project: "प्रोजेक्ट", docs: "दस्तावेज़", technical: "तकनीकी" },
    links: {
      repo: "सोर्स कोड · GitHub",
      npm: "पैकेज · npm",
      issues: "इश्यू",
      contributing: "योगदान",
      releases: "रिलीज़ नोट्स",
      installation: "इंस्टॉलेशन",
      cli: "CLI संदर्भ",
      providers: "Provider कैटलॉग",
      scope: "दायरा",
      architecture: "आर्किटेक्चर",
      howItWorks: "gup कैसे काम करता है",
      security: "सुरक्षा",
      llms: "llms.txt",
    },
    languages: "भाषाएँ",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
