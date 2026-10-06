/**
 * Arabic catalog, translated from en.js (the source) into formal Modern
 * Standard Arabic: Arabic punctuation (، ؛ ؟, tested), Western digits, Latin
 * product names left as they are, with the conjunction و attached ("وbrew").
 * The page is right-to-left; commands, key caps and the terminal stay
 * left-to-right (styles/foundation/direction.css). Format and rules: see
 * en.js.
 */

/**
 * The noun مصدر ("source") after a Western-digit count, per CLDR category:
 * 3–10 take the broken plural (few), 11–99 the accusative singular (many),
 * round hundreds the genitive singular (other). zero, one and two keep the
 * singular: the provider registry never gets that small.
 */
const SOURCE_BY_CATEGORY = Object.freeze({
  zero: "مصدر",
  one: "مصدر",
  two: "مصدر",
  few: "مصادر",
  many: "مصدرًا",
  other: "مصدر",
});

/**
 * A plural message counting sources: `phrase` receives the noun form of each
 * category and returns the whole sentence for it.
 *
 * @param {(sources: string) => string} phrase
 */
function countingSources(phrase) {
  const forms = Object.entries(SOURCE_BY_CATEGORY).map(([category, noun]) => [
    category,
    phrase(noun),
  ]);
  return { $count: "providers", ...Object.fromEntries(forms) };
}

export default {
  meta: {
    title: "gup — حدّث winget وbrew وnpm وpip بأمر واحد",
    description: countingSources(
      (sources) =>
        `أداة CLI مجانية ومفتوحة المصدر تفحص {providers} ${sources} وتحدّثها — winget ` +
        "وscoop وHomebrew وnpm وpip وcargo وhelm — من تطبيق طرفية واحد بملء الشاشة.",
    ),
    ogTitle: countingSources((sources) => `gup — أمر واحد لتحديث {providers} ${sources}`),
    ogDescription: countingSources(
      (sources) =>
        "برنامج واحد يفحص بالتوازي winget وscoop وHomebrew وMacPorts وnpm وpip وcargo وhelm " +
        `وkubectl وVS Code وJetBrains — {providers} ${sources} — ويحدّث ما تختاره في طرفية ` +
        "مدمجة في واجهته.",
    ),
    ogImageAlt: countingSources(
      (sources) =>
        `gup — أمر واحد لتحديث {providers} ${sources}. أداة CLI مفتوحة المصدر تدعم winget ` +
        "وHomebrew وnpm وpip وcargo وhelm.",
    ),
    keywords:
      "تحديث كل الحزم, مدير الحزم, winget upgrade, brew upgrade, npm update -g, " +
      "pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, بديل topgrade",
  },
  common: {
    skipLink: "انتقل إلى المحتوى",
    home: "gup — الصفحة الرئيسية",
    github: "الشيفرة المصدرية على GitHub",
    install: "تثبيت",
    copy: "نسخ",
    copied: "تم النسخ!",
    copyLabel: "انسخ أمر التثبيت: {installCommand}",
    copyStatus: "تم نسخ الأمر إلى الحافظة",
    copyFailed: "تعذّر النسخ — حدّد الأمر وانسخه يدويًا",
    language: "اللغة",
    languageCurrent: "اللغة: {endonym}",
    newBadge: "جديد",
    noscript:
      "JavaScript معطّل: تبقى الصفحة مقروءة بالكامل، ولا يتوقف إلا عرض الطرفية المتحرك " +
      "وأزرار النسخ.",
  },
  nav: {
    label: "أقسام الصفحة",
    features: "الميزات",
    coverage: "التغطية",
    how: "آلية العمل",
    faq: "الأسئلة الشائعة",
  },
  hero: {
    eyebrow: "جديد — التحديثات تجري الآن داخل الواجهة",
    title: {
      before: "أمر واحد.",
      accent: countingSources((sources) => `{providers} ${sources}`),
      after: "كلها محدَّثة.",
    },
    lead:
      "توقّف عن ملاحقة **winget** و**brew** و**npm** وpip وcargo وhelm. يفحصها gup كلها " +
      "بالتوازي، ويعرض ما صار قديمًا، ويحدّث ما تختاره — مباشرةً، في طرفية مدمجة في واجهته.",
    secondaryCta: "عرض على GitHub",
    trust: [
      "MIT · مفتوح المصدر",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "بلا قياس عن بُعد",
      "بلا خدمة خلفية · الجدولة اختيارية",
    ],
    terminal: {
      label: "gup أثناء العمل",
      tabs: { app: "الواجهة", update: "التحديث", json: "JSON" },
      caption:
        "الواجهة بالإنجليزية افتراضيًا، وبالفرنسية عبر الأمر `gup language fr`. الأوامر " +
        "والخيارات ومخرجات JSON متطابقة في كل اللغات.",
    },
  },
  features: {
    kicker: "01 / الميزات",
    title: "كل شيء يجري في واجهة واحدة.",
    lead:
      "افحص، واختر، وحدّث، وجدوِل، وراجِع — يُبقيك gup داخل تطبيق طرفية واحد بملء الشاشة.",
    items: {
      inline: {
        title: "تحديثات دون مغادرة gup",
        text:
          "تعمل برامج التثبيت داخل لوحة طرفية مدمجة في الواجهة، مع أشرطة التقدم والمطالبات " +
          "والألوان كما هي. ثم تختفي الحزم المحدَّثة من القائمة دون فحص جديد. وإن تعذّر " +
          "استخدام الطرفية المدمجة، يوضح gup السبب ويُجري التحديث في طرفيتك الخاصة.",
      },
      select: {
        title: "حدّد عدة حزم وشغّلها دفعة واحدة",
        text:
          "حدّد الحزم بمفتاح [[مسافة]]، واختر الكل بمفتاح [[a]]، ثم شغّلها بمفتاح [[Enter]]. " +
          "طابور واحد وملخص واحد.",
      },
      schedule: {
        title: "تحديثات مجدولة، حزمةً حزمة",
        text:
          "حدّد الحزم واضغط [[p]]: يُجدوَل تحديث `ripgrep` أسبوعيًا ويبقى `node` على حاله. " +
          "تستهدف الجداول الحزمَ وحدها، لا provider بأكمله؛ ويشغّل مُجدوِل نظام التشغيل gup " +
          "لبرهة لتنفيذ ما حان موعده، فلا شيء يبقى مقيمًا في الذاكرة.",
      },
      journal: {
        title: "سجل النشاط",
        text:
          "يُسجَّل كل فحص وكل تحديث محليًا. تعرض مخططات داخل الطرفية نشاطك والحزم الأكثر " +
          "تحديثًا، ويمكنك تصدير السجل لتشخيص المشكلات.",
      },
      report: {
        title: "تقرير HTML",
        text:
          "يفتح `gup report`، أو مفتاح [[o]] في سجل النشاط، تقريرًا واضحًا وسهل التصفح عن " +
          "سجلك في المتصفح — ملف واحد يعمل دون اتصال، يقرؤه أي شخص، لا مستخدمو الطرفية " +
          "وحدهم.",
      },
      themes: {
        title: "سمات تبقى مقروءة",
        text:
          "27 سمةً مدمجةً أو ألوانك الخاصة: يفحص gup كلًّا منها وفق WCAG AA — 4.5:1 للنص، " +
          "و3:1 للحدود، و7:1 إن اخترت AAA — ويصحّح ما يقصر عن ذلك.",
      },
      os: {
        title: "يعرف نظام تشغيلك",
        text:
          "وحدات provider التي لا يمكنها العمل على نظامك تظهر باهتة لا مخفية: الأدوات الخاصة " +
          "بنظام Windows تظهر على هذا النحو على جهاز Mac، والعكس صحيح.",
      },
      script: {
        title: "مصمَّم للسكربتات وCI",
        text:
          "`gup list --json`، ورموز خروج ثابتة، و`-y` لتخطي التأكيدات، وأهداف " +
          "`provider:package` تتجاوز الفحص.",
      },
    },
  },
  coverage: {
    kicker: "02 / التغطية",
    title: countingSources(
      (sources) => `{providers} ${sources}. ثلاثة أنظمة. ملف تنفيذي واحد.`,
    ),
    lead:
      "الملف التنفيذي نفسه على Windows وmacOS وLinux — عقد provider نفسه، وJSON نفسه. ما " +
      "يتغيّر هو طبقة نظام التشغيل التي يستطيع gup التحكم فيها.",
    delegated: "تفويض",
    supported: "وحدات provider المدعومة",
    everywhere: "متطابق في كل مكان",
    allProviders: "جميع وحدات provider البالغ عددها {providers}، مصنّفة حسب المجال",
    catalogLink: "تصفّح الكتالوج الكامل لوحدات provider",
    platforms: {
      windows: {
        badge: "الهدف الأساسي",
        foot: "جسر WSL: apt وdnf وpacman وFlatpak وNix وLinuxbrew داخل توزيعاتك.",
      },
      macos: {
        badge: "دعم أصلي",
        foot: "Apple Silicon وIntel · تتبُّع روابط brew الرمزية في Cellar · `mas` اختياري.",
      },
      linux: {
        badge: "دعم أصلي",
        foot:
          "يُحدَّد مالك الملف التنفيذي عبر `dpkg -S` أو `rpm -qf`، ثم يُعاد التحديث إلى مدير " +
          "الحزم ذاك.",
      },
    },
    domains: {
      os: "مديرو حزم النظام",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET وPHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "لغات أخرى",
      toolchain: "مديرو الإصدارات",
      cloud: "أدوات CLI السحابية",
      iac: "البنية التحتية ككود",
      kubernetes: "Kubernetes",
      containers: "الحاويات",
      security: "أدوات الأمان",
      "dev-cli": "أدوات CLI للمطورين",
      ide: "بيئات التطوير والمحررات",
      "editor-plugins": "إضافات المحررات",
      "embedded-mobile": "الأنظمة المدمجة والجوال",
      shell: "Shell وموجّه الأوامر",
      self: "gup نفسه",
    },
  },
  how: {
    kicker: "03 / آلية العمل",
    title: "منسِّق، لا مدير حزم إضافي.",
    lead:
      "يشغّل gup أوامر كل أداة بالتوازي ويصفّ إجاباتها جنبًا إلى جنب. لا مستودع حزم، ولا ذاكرة " +
      "تخزين مؤقت، ولا شيء يبقى قيد التشغيل.",
    steps: {
      scan: {
        title: "الفحص",
        text:
          "يجيب كل provider مكتشَف عن `listOutdated()`، أربعة في كل مرة. وإن فشل أحدها، فلا " +
          "يتأثر إلا صفّه.",
      },
      choose: {
        title: "الاختيار",
        text:
          "راجع الحزم مجمّعة حسب provider، وصفِّها، واخترها — أو تخطَّ الفحص باستخدام " +
          "`gup update brew:fzf`.",
      },
      update: {
        title: "التحديث",
        text:
          "تعمل الأوامر الأصلية كمتجه وسائط، ولا تمر أبدًا عبر صدفة الأوامر. وتُسجَّل كل محاولة " +
          "في السجل المحلي.",
      },
    },
    docsLink: "البنية بالتفصيل",
  },
  security: {
    kicker: "04 / الأمان",
    title: "ينفّذ أوامر بصلاحيات مرتفعة، ولذلك صُمِّم بعناية.",
    lead:
      "نقطة واحدة لاستدعاء صدفة الأوامر، ومتجهات وسائط صارمة، وقائمة سماح تثبّتها الاختبارات — " +
      "وكل إيداع يمر عبر ثلاث أدوات للتحليل الساكن.",
    items: {
      execution: {
        title: "التنفيذ",
        text:
          "تعمل العمليات الفرعية كمتجهات argv صارمة، دون `shell: true` أبدًا، عبر نقطة دخول " +
          "واحدة خاضعة للتدقيق.",
      },
      supplyChain: {
        title: "سلسلة التوريد",
        text: "تنزيلات عبر HTTPS فقط، وتدقيق للتبعيات في كل بناء، ومراجعة أسبوعية للتحديثات.",
      },
      analysis: {
        title: "التحليل الساكن",
        text:
          "CodeQL وSemgrep وeslint-plugin-security على كل إيداع، إلى جانب مجموعة اختبارات " +
          "مخصصة لثوابت الأمان.",
      },
    },
    links: { policy: "سياسة الأمان", contributing: "المساهمة" },
  },
  faq: {
    kicker: "05 / الأسئلة الشائعة",
    title: "أسئلة وأجوبة.",
    items: {
      replace: {
        q: "هل يحلّ gup محل winget أو brew أو npm؟",
        a:
          "لا. ينسّق gup الأوامر الأصلية لكل أداة (`winget upgrade` و`brew outdated` " +
          "و`npm update -g` و`pip list --outdated`…) خلف واجهة واحدة. لا بروتوكول مبتكَر، " +
          "ولا ذاكرة تخزين مؤقت للإصدارات.",
      },
      platforms: {
        q: "هل يعمل على macOS وLinux؟",
        a:
          "نعم. على macOS بشكل أصلي: حزم Homebrew من نوعَي formula وcask، وMacPorts، وMac App " +
          "Store، على Apple Silicon وIntel. وعلى Linux، يتولى Homebrew/Linuxbrew وNix مستوى " +
          "النظام، ويُعاد الملف التنفيذي الذي ثبّتته التوزيعة إلى `apt` أو `dnf`. وكل ما " +
          "يعلو طبقة النظام — npm وpip وcargo وhelm وVS Code… — يعمل بالطريقة نفسها على الأنظمة " +
          "الثلاثة.",
      },
      install: {
        q: "كيف أثبّت gup؟",
        a:
          "نفّذ `{installCommand}`، ثم `gup doctor` لمعرفة وحدات provider المكتشَفة. يتطلب " +
          "Node.js {nodeEngine} أو أحدث. يسمح `--allow-scripts=node-pty` بتشغيل سكربتات " +
          "تثبيت node-pty، الذي تعمل به الطرفية المدمجة؛ ومن دونه يُصدر npm 11 تحذيرًا، " +
          "ويتخطى npm 12 هذه السكربتات.",
      },
      ci: {
        q: "هل يمكن استخدام gup في CI؟",
        a:
          "نعم. يقدّم `gup list --json --fast` مخرجات قابلة للقراءة آليًا، ويتخطى " +
          "`gup update --all -y` كل التأكيدات. رموز الخروج ثابتة: `0` نجاح، و`1` فشل جزئي، " +
          "و`2` وسائط غير صالحة.",
      },
      count: {
        q: "كم مدير حزم يغطي gup؟",
        a:
          "يغطي {providers} provider، لكلٍّ منها وحدة معزولة: winget وscoop وchocolatey " +
          "وHomebrew وMacPorts وnpm وpnpm وpip وuv وcargo وgem وcomposer وأدوات dotnet وhelm " +
          "وkubectl وterraform وإضافات VS Code وبيئات التطوير من JetBrains وتوزيعات WSL، " +
          "وغيرها الكثير.",
      },
      security: {
        q: "هل تشغيله آمن؟",
        a:
          "تمر كل عملية فرعية عبر نقطة دخول واحدة كمتجه وسائط صارم — لا عبر صدفة الأوامر أبدًا — " +
          "مع قائمة سماح تثبّتها الاختبارات. ويعمل CodeQL وSemgrep وgitleaks وaudit-ci " +
          "وDependabot باستمرار. ولا يرسل gup أي بيانات قياس عن بُعد.",
      },
      topgrade: {
        q: "ما الفرق بينه وبين topgrade؟",
        a:
          "يشغّل topgrade التحديثات مباشرةً؛ أما gup فيجيب أولًا عن سؤال «ما القديم، ومن أي " +
          "إصدار إلى أي إصدار». الفحص خطوة مستقلة، مع مخرجات JSON، واختيار حزمة بحزمة، وأهداف " +
          "`provider:package`، وجداول لكل حزمة، وسجل محلي يمكنك مراجعته.",
      },
      language: {
        q: "ما لغة الواجهة؟",
        a:
          "بالإنجليزية افتراضيًا. الأمر `gup language fr` يحوّلها إلى الفرنسية ويحفظ هذا " +
          "الاختيار؛ ومتغير البيئة `GUP_LANG=fr` يفعل الشيء نفسه في صدفة أوامر واحدة، وله " +
          "الأولوية على ذلك الاختيار. الأوامر والخيارات ومخرجات JSON لا تعتمد على اللغة، وهذا " +
          "الموقع متاح بثماني لغات.",
      },
    },
  },
  install: {
    kicker: "06 / التثبيت",
    title: "ثلاثون ثانية، وتعرف كل شيء.",
    lead: "تثبيت واحد عبر npm، وأمر واحد، وقائمة كاملة بكل ما صار قديمًا على جهازك.",
    examples: {
      menu: "واجهة بملء الشاشة",
      listFast: "ما القديم، فحص سريع",
      updateAll: "كل شيء، دون تأكيد (CI)",
      target: "حزمة واحدة، دون فحص",
      doctor: "ما المكتشَف، وكيف تثبّت الباقي",
    },
    support: {
      title: "هل وجدته مفيدًا؟",
      text:
        "gup مجاني، بترخيص MIT، وأطوّره في وقت فراغي. إن وفّر عليك وقتًا، فإن فنجان قهوة أو " +
        "نجمة يساعدان على مواصلة تطوير وحدات provider البالغ عددها {providers}.",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "أضف نجمة على GitHub",
    },
  },
  footer: {
    tagline: countingSources(
      (sources) =>
        `Global Updater — أداة CLI واحدة تدير {providers} ${sources} للتثبيت. TypeScript ` +
        "صارم، وESM، وNode ≥ {node}.",
    ),
    columns: { project: "المشروع", docs: "التوثيق", technical: "تقني" },
    links: {
      repo: "الشيفرة المصدرية · GitHub",
      npm: "الحزمة · npm",
      issues: "المشكلات",
      support: "المساعدة",
      contributing: "المساهمة",
      conduct: "مدونة السلوك",
      releases: "ملاحظات الإصدار",
      installation: "التثبيت",
      cli: "مرجع CLI",
      providers: "كتالوج provider",
      scope: "النطاق",
      architecture: "البنية",
      howItWorks: "كيف يعمل gup",
      security: "الأمان",
      llms: "llms.txt",
    },
    languages: "اللغات",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
