/**
 * Bengali catalog, translated from en.js (the source) into standard written
 * Bengali (চলিত ভাষা), formal *আপনি*. Case endings attach to Latin words with
 * a hyphen (`gup-এর`, `provider-কে`), counts take the classifier টি
 * (`153টি উৎস`), and sentences end with the danda (tested). The noun does not
 * inflect after a numeral, so no plural object. Format and rules: see en.js.
 */
export default {
  meta: {
    title: "gup — এক কমান্ডে winget, brew, npm ও pip আপডেট করুন",
    description:
      "বিনামূল্যের ওপেন সোর্স CLI, যা একটি ফুল-স্ক্রিন টার্মিনাল অ্যাপ থেকেই {providers}টি উৎস — " +
      "winget, scoop, Homebrew, npm, pip, cargo, helm — স্ক্যান ও আপডেট করে।",
    ogTitle: "gup — এক কমান্ড, {providers}টি উৎস আপ-টু-ডেট",
    ogDescription:
      "একটিমাত্র বাইনারি winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, kubectl, " +
      "VS Code ও JetBrains — মোট {providers}টি উৎস — একসঙ্গে স্ক্যান করে, আর আপনি যা বেছে নেন, " +
      "তার ইন্টারফেস ছেড়ে না বেরিয়েই তা আপডেট করে।",
    ogImageAlt:
      "gup — এক কমান্ড, {providers}টি উৎস আপ-টু-ডেট। winget, Homebrew, npm, pip, cargo ও " +
      "helm-এর জন্য ওপেন সোর্স CLI।",
    keywords:
      "সব প্যাকেজ আপডেট, প্যাকেজ ম্যানেজার, winget upgrade, brew upgrade, npm update -g, " +
      "pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, topgrade-এর বিকল্প",
  },
  common: {
    skipLink: "মূল বিষয়বস্তুতে যান",
    home: "gup — হোম",
    github: "GitHub-এ সোর্স কোড",
    install: "ইনস্টল করুন",
    copy: "কপি করুন",
    copied: "কপি হয়েছে!",
    copyLabel: "ইনস্টল কমান্ড কপি করুন: {installCommand}",
    copyStatus: "কমান্ড ক্লিপবোর্ডে কপি হয়েছে",
    copyFailed: "কপি করা যায়নি — কমান্ডটি সিলেক্ট করে নিজে কপি করুন",
    language: "ভাষা",
    languageCurrent: "ভাষা: {endonym}",
    newBadge: "নতুন",
    noscript:
      "JavaScript বন্ধ আছে: পৃষ্ঠাটি পুরোপুরি পড়া যাবে; শুধু টার্মিনালের রিপ্লে আর কপি বোতাম " +
      "কাজ করবে না।",
  },
  nav: {
    label: "পৃষ্ঠার বিভাগ",
    features: "ফিচার",
    coverage: "কভারেজ",
    how: "কীভাবে কাজ করে",
    faq: "প্রশ্নোত্তর",
  },
  hero: {
    eyebrow: "নতুন — আপডেট এখন ইন্টারফেসের ভেতরেই চলে",
    title: { before: "এক কমান্ড।", accent: "{providers}টি উৎস", after: "সবসময় আপ-টু-ডেট।" },
    lead:
      "**winget**, **brew**, **npm**, pip, cargo আর helm-এর পেছনে আলাদা করে ছোটাছুটি বন্ধ " +
      "করুন। gup এগুলো সব একসঙ্গে স্ক্যান করে, কী পুরোনো হয়েছে দেখায়, আর আপনি যা বেছে নেন " +
      "তা আপডেট করে — নিজের ইন্টারফেস থেকে কখনো না বেরিয়েই।",
    secondaryCta: "GitHub-এ দেখুন",
    trust: [
      "MIT · ওপেন সোর্স",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "শূন্য টেলিমেট্রি",
      "কোনো ডেমন নেই · শিডিউলিং ঐচ্ছিক",
    ],
    terminal: {
      label: "gup কাজ করছে",
      tabs: { app: "ইন্টারফেস", update: "আপডেট", json: "JSON" },
      caption: "ইন্টারফেসটি ফরাসি ভাষায়। কমান্ড, ফ্ল্যাগ আর JSON আউটপুট সব ভাষাতেই একই।",
    },
  },
  features: {
    kicker: "01 / ফিচার",
    title: "সবকিছু একটিই ইন্টারফেসে।",
    lead:
      "স্ক্যান, বাছাই, আপডেট, শিডিউল আর পর্যালোচনা — gup আপনাকে একটিমাত্র ফুল-স্ক্রিন টার্মিনাল " +
      "অ্যাপেই রাখে।",
    items: {
      inline: {
        title: "gup না ছেড়েই আপডেট",
        text:
          "ইনস্টলারগুলো ইন্টারফেসের ভেতরে বসানো একটি টার্মিনাল প্যানে চলে — প্রোগ্রেস বার, " +
          "প্রম্পট আর রং সবই অক্ষত থাকে। কাজ শেষ হলে তালিকাটি সেখানেই রিফ্রেশ হয়।",
      },
      select: {
        title: "একাধিক বাছুন, একবারে চালান",
        text:
          "[[Space]] দিয়ে প্যাকেজ চিহ্নিত করুন, [[a]] দিয়ে সব বেছে নিন, [[Enter]] দিয়ে চালু " +
          "করুন। একটি কিউ, একটি সারসংক্ষেপ।",
      },
      schedule: {
        title: "প্যাকেজ ধরে ধরে নির্ধারিত আপডেট",
        text:
          "`ripgrep`-কে সাপ্তাহিক শিডিউলে রাখুন আর `node`-কে যেমন আছে তেমনই থাকতে দিন। " +
          "শিডিউল সবসময় প্যাকেজকে লক্ষ্য করে, কখনো পুরো একটি provider-কে নয়, আর এগুলো চালু " +
          "করে আপনার OS-এর শিডিউলার: ব্যাকগ্রাউন্ডে কিছুই চলতে থাকে না।",
      },
      journal: {
        title: "কার্যকলাপ লগ",
        text:
          "প্রতিটি স্ক্যান ও আপডেট আপনার মেশিনেই লগ হয়। টার্মিনাল চার্টে আপনার কার্যকলাপ আর কোন " +
          "প্যাকেজ সবচেয়ে বেশি আপডেট হয় তা দেখা যায়; ডিবাগ করতে লগ এক্সপোর্ট করুন।",
      },
      report: {
        title: "HTML রিপোর্ট",
        text:
          "`gup report` ব্রাউজারে আপনার ইতিহাসের একটি পরিষ্কার, সহজে ঘুরে দেখার মতো রিপোর্ট " +
          "খোলে — একটিমাত্র অফলাইন ফাইল, যা যে-কেউ পড়তে পারেন, শুধু টার্মিনাল ব্যবহারকারীরাই নন।",
      },
      themes: {
        title: "সবসময় পড়ার উপযোগী থিম",
        text:
          "একটি থিম বা নিজের পছন্দের রং বেছে নিন: gup WCAG AA কনট্রাস্ট নিশ্চিত করে, তাই লেখা " +
          "কখনো ব্যাকগ্রাউন্ডে মিশে যায় না।",
      },
      os: {
        title: "আপনার OS সম্পর্কে সচেতন",
        text:
          "যে providers আপনার সিস্টেমে চলতে পারে না, সেগুলো লুকানো থাকে না, ধূসর দেখায়: Mac-এ " +
          "শুধু Windows-এর টুলগুলো সেভাবেই চিহ্নিত থাকে, আর উল্টোটাও।",
      },
      script: {
        title: "স্ক্রিপ্ট ও CI-এর জন্য তৈরি",
        text:
          "`gup list --json`, স্থিতিশীল এক্সিট কোড, প্রম্পট এড়াতে `-y`, আর স্ক্যান " +
          "এড়িয়ে যাওয়া `provider:package` টার্গেট।",
      },
    },
  },
  coverage: {
    kicker: "02 / কভারেজ",
    title: "{providers}টি উৎস। তিনটি সিস্টেম। একটি বাইনারি।",
    lead:
      "Windows, macOS ও Linux-এ একই এক্সিকিউটেবল — একই provider চুক্তি, একই JSON। বদলায় শুধু " +
      "OS-এর সেই স্তর, যা gup চালাতে পারে।",
    delegated: "হস্তান্তর",
    everywhere: "সব জায়গায় একই",
    allProviders: "সব {providers}টি provider, ডোমেইন অনুযায়ী",
    catalogLink: "পুরো provider ক্যাটালগ দেখুন",
    platforms: {
      windows: {
        badge: "প্রধান লক্ষ্য",
        foot: "WSL ব্রিজ: আপনার ডিস্ট্রোর ভেতরে apt, dnf, pacman, Flatpak, Nix ও Linuxbrew।",
      },
      macos: {
        badge: "নেটিভ",
        foot:
          "Apple Silicon ও Intel · brew Cellar-এর সিমলিংক স্বয়ংক্রিয়ভাবে অনুসরণ করা হয় · " +
          "`mas` ঐচ্ছিক।",
      },
      linux: {
        badge: "নেটিভ",
        foot:
          "কোনো বাইনারির মালিক `dpkg -S` বা `rpm -qf` দিয়ে খুঁজে বের করা হয়, তারপর আপডেট সেই " +
          "ম্যানেজারের কাছেই ফেরত যায়।",
      },
    },
    domains: {
      os: "OS প্যাকেজ ম্যানেজার",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET ও PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "অন্যান্য ভাষা",
      toolchain: "ভার্সন ম্যানেজার",
      cloud: "ক্লাউড CLI",
      iac: "ইনফ্রাস্ট্রাকচার অ্যাজ কোড",
      kubernetes: "Kubernetes",
      containers: "কনটেইনার",
      security: "নিরাপত্তা টুল",
      "dev-cli": "ডেভেলপার CLI",
      ide: "IDE ও এডিটর",
      "editor-plugins": "এডিটর প্লাগইন",
      "embedded-mobile": "এমবেডেড ও মোবাইল",
      shell: "শেল ও প্রম্পট",
      self: "gup নিজেই",
    },
  },
  how: {
    kicker: "03 / কীভাবে কাজ করে",
    title: "একটি অর্কেস্ট্রেটর, আরেকটি প্যাকেজ ম্যানেজার নয়।",
    lead:
      "gup প্রতিটি টুলের নিজস্ব কমান্ড একসঙ্গে চালায় আর উত্তরগুলো পাশাপাশি সাজিয়ে দেখায়। কোনো " +
      "প্যাকেজ রেজিস্ট্রি নেই, ক্যাশ নেই, ব্যাকগ্রাউন্ডে কিছুই চলতে থাকে না।",
    steps: {
      scan: {
        title: "স্ক্যান",
        text:
          "শনাক্ত হওয়া প্রতিটি provider `listOutdated()`-এর উত্তর দেয়, একবারে চারটি করে। " +
          "কোনোটি ব্যর্থ হলে শুধু তার নিজের সারিটিই প্রভাবিত হয়।",
      },
      choose: {
        title: "বাছাই",
        text:
          "provider অনুযায়ী সাজানো প্যাকেজগুলো দেখুন, ফিল্টার করুন, বেছে নিন — অথবা " +
          "`gup update brew:fzf` দিয়ে স্ক্যান পুরোপুরি এড়িয়ে যান।",
      },
      update: {
        title: "আপডেট",
        text:
          "নেটিভ কমান্ড আর্গুমেন্ট ভেক্টর হিসেবে চলে, কখনো শেলের মাধ্যমে নয়। প্রতিটি চেষ্টা " +
          "স্থানীয় লগে লেখা থাকে।",
      },
    },
    docsLink: "আর্কিটেকচার বিস্তারিত",
  },
  security: {
    kicker: "04 / নিরাপত্তা",
    title: "এটি বিশেষাধিকারসম্পন্ন কমান্ড চালায়। তাই সেভাবেই তৈরি।",
    lead:
      "শেলে যাওয়ার একটিমাত্র পথ, কঠোর আর্গুমেন্ট ভেক্টর, টেস্ট দিয়ে বাঁধা অনুমোদিত তালিকা — আর " +
      "প্রতিটি কমিট তিনটি স্ট্যাটিক অ্যানালাইজার পেরিয়ে আসে।",
    items: {
      execution: {
        title: "এক্সিকিউশন",
        text:
          "সাবপ্রসেস চলে কঠোর argv ভেক্টর হিসেবে, কখনো `shell: true` নয়, একটিমাত্র অডিট করা " +
          "প্রবেশপথ দিয়ে।",
      },
      supplyChain: {
        title: "সাপ্লাই চেইন",
        text:
          "শুধু HTTPS-এ ডাউনলোড, প্রতিটি বিল্ডে ডিপেনডেন্সি অডিট, প্রতি সপ্তাহে আপডেট " +
          "পর্যালোচনা।",
      },
      analysis: {
        title: "স্ট্যাটিক বিশ্লেষণ",
        text:
          "প্রতিটি কমিটে CodeQL, Semgrep ও eslint-plugin-security, সঙ্গে নিরাপত্তার " +
          "ইনভ্যারিয়েন্ট যাচাইয়ের জন্য আলাদা টেস্ট স্যুট।",
      },
    },
    links: { policy: "নিরাপত্তা নীতি", contributing: "অবদান রাখুন" },
  },
  faq: {
    kicker: "05 / প্রশ্নোত্তর",
    title: "আপনার প্রশ্ন, আমাদের উত্তর।",
    items: {
      replace: {
        q: "gup কি winget, brew বা npm-এর জায়গা নেয়?",
        a:
          "না। gup প্রতিটি টুলের নেটিভ কমান্ড (`winget upgrade`, `brew outdated`, " +
          "`npm update -g`, `pip list --outdated`…) একটি ইন্টারফেসের পেছনে পরিচালনা করে। কোনো " +
          "বানানো প্রোটোকল নেই, ভার্সন ক্যাশ নেই, সরাসরি ডাউনলোডও নেই।",
      },
      platforms: {
        q: "এটি কি macOS আর Linux-এ চলে?",
        a:
          "হ্যাঁ। macOS-এ নেটিভভাবে: Homebrew-এর ফর্মুলা ও কাস্ক, MacPorts আর Mac App Store, " +
          "Apple Silicon ও Intel দুটোতেই। Linux-এ Homebrew/Linuxbrew হলো OS-স্তরের provider, আর " +
          "ডিস্ট্রিবিউশনের ইনস্টল করা বাইনারি `apt` বা `dnf`-এর কাছে ফেরত দেওয়া হয়। OS স্তরের " +
          "ওপরের সবকিছু — npm, pip, cargo, helm, VS Code… — তিনটি সিস্টেমেই একইভাবে আচরণ করে।",
      },
      install: {
        q: "gup কীভাবে ইনস্টল করব?",
        a:
          "`{installCommand}` চালান, তারপর কোন providers শনাক্ত হয়েছে দেখতে `gup doctor` " +
          "চালান। Node.js {nodeEngine} বা তার পরের সংস্করণ লাগবে।",
      },
      ci: {
        q: "CI-তে কি gup ব্যবহার করা যায়?",
        a:
          "হ্যাঁ। `gup list --json --fast` মেশিনে পড়ার উপযোগী আউটপুট দেয়, আর " +
          "`gup update --all -y` সব প্রম্পট এড়িয়ে যায়। এক্সিট কোড স্থিতিশীল: `0` সফল, `1` " +
          "আংশিক ব্যর্থতা, `2` অবৈধ আর্গুমেন্ট।",
      },
      count: {
        q: "gup কতগুলো প্যাকেজ ম্যানেজার সমর্থন করে?",
        a:
          "{providers}টি provider, প্রতিটি আলাদা মডিউলে: winget, scoop, chocolatey, Homebrew, " +
          "MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, dotnet টুল, helm, kubectl, " +
          "terraform, VS Code ও JetBrains এক্সটেনশন, WSL ডিস্ট্রিবিউশন এবং আরও অনেক কিছু।",
      },
      security: {
        q: "এটি চালানো কি নিরাপদ?",
        a:
          "প্রতিটি সাবপ্রসেস একটিমাত্র প্রবেশপথ দিয়ে কঠোর আর্গুমেন্ট ভেক্টর হিসেবে যায় — কখনো " +
          "শেলের মাধ্যমে নয় — আর টেস্ট দিয়ে বাঁধা অনুমোদিত তালিকা মেনে। CodeQL, Semgrep, " +
          "gitleaks, audit-ci ও Dependabot নিরবচ্ছিন্নভাবে চলে। gup কোনো টেলিমেট্রি পাঠায় না।",
      },
      topgrade: {
        q: "topgrade-এর সঙ্গে এর পার্থক্য কী?",
        a:
          "topgrade সরাসরি আপডেট চালায়; gup আগে উত্তর দেয় “কী পুরোনো হয়েছে, কোন সংস্করণ থেকে " +
          "কোন সংস্করণে”। স্ক্যান আলাদা একটি ধাপ, যাতে আছে JSON আউটপুট, প্যাকেজ ধরে ধরে বাছাই, " +
          "`provider:package` টার্গেট, প্যাকেজভিত্তিক শিডিউল আর একটি স্থানীয় ইতিহাস, যা আপনি " +
          "যেকোনো সময় দেখে নিতে পারেন।",
      },
      language: {
        q: "ইন্টারফেসটি কোন ভাষায়?",
        a:
          "আপাতত ইন্টারফেসটি ফরাসি ভাষায়। কমান্ড, ফ্ল্যাগ আর JSON আউটপুট ভাষার ওপর নির্ভর করে " +
          "না, আর এই সাইটটি আটটি ভাষায় পাওয়া যায়।",
      },
    },
  },
  install: {
    kicker: "06 / ইনস্টল",
    title: "ত্রিশ সেকেন্ডেই সব জেনে যাবেন।",
    lead: "একবার npm ইনস্টল, একটি কমান্ড, আর আপনার মেশিনে কী কী পুরোনো হয়েছে তার পূর্ণ তালিকা।",
    examples: {
      menu: "ফুল-স্ক্রিন ইন্টারফেস",
      listFast: "কী পুরোনো, দ্রুত স্ক্যান",
      updateAll: "সবকিছু, কোনো প্রম্পট ছাড়া (CI)",
      target: "একটি প্যাকেজ, স্ক্যান ছাড়া",
      doctor: "কী শনাক্ত হয়েছে, আর বাকিগুলো কীভাবে ইনস্টল করবেন",
    },
    support: {
      title: "কাজে লেগেছে?",
      text:
        "gup বিনামূল্যের, MIT লাইসেন্সের, আর আমি অবসর সময়ে এটি রক্ষণাবেক্ষণ করি। এটি আপনার " +
        "সময় বাঁচিয়ে থাকলে, এক কাপ কফি বা একটি স্টার {providers}টি provider-কে এগিয়ে নিতে " +
        "সাহায্য করে।",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "GitHub-এ স্টার দিন",
    },
  },
  footer: {
    tagline:
      "Global Updater — {providers}টি ইনস্টলেশন উৎসের জন্য একটি CLI। স্ট্রিক্ট TypeScript, ESM, " +
      "Node ≥ {node}।",
    columns: { project: "প্রজেক্ট", docs: "ডকুমেন্টেশন", technical: "প্রযুক্তিগত" },
    links: {
      repo: "সোর্স কোড · GitHub",
      npm: "প্যাকেজ · npm",
      issues: "ইস্যু",
      contributing: "অবদান",
      releases: "রিলিজ নোট",
      installation: "ইনস্টলেশন",
      cli: "CLI রেফারেন্স",
      providers: "Provider ক্যাটালগ",
      scope: "পরিধি",
      architecture: "আর্কিটেকচার",
      howItWorks: "gup কীভাবে কাজ করে",
      security: "নিরাপত্তা",
      llms: "llms.txt",
    },
    languages: "ভাষা",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
