/**
 * Simplified Chinese catalog, translated from en.js (the source) in the
 * mainland tech register: full-width punctuation, and a half-width space
 * between Han characters and Latin words, digits, placeholders and code
 * (tested). Nouns do not inflect after a numeral, so no plural object.
 * Format and rules: see en.js.
 */
export default {
  meta: {
    title: "gup — 一条命令更新 winget、brew、npm 和 pip",
    description:
      "免费开源的 CLI 工具，在一个全屏终端应用中扫描并更新 {providers} 个来源：winget、" +
      "scoop、Homebrew、npm、pip、cargo、helm 等。",
    ogTitle: "gup — 一条命令，{providers} 个来源保持最新",
    ogDescription:
      "一个二进制文件并行扫描 winget、scoop、Homebrew、MacPorts、npm、pip、cargo、helm、" +
      "kubectl、VS Code 和 JetBrains 等共 {providers} 个来源，选中什么，就在它界面内嵌的" +
      "终端里更新什么。",
    ogImageAlt:
      "gup — 一条命令，{providers} 个来源保持最新。面向 winget、Homebrew、npm、pip、cargo " +
      "和 helm 的开源 CLI。",
    keywords:
      "更新所有软件包, 包管理器, winget upgrade, brew upgrade, npm update -g, pip outdated, " +
      "cargo, helm, kubectl, cli, windows, macos, linux, topgrade 替代方案",
  },
  common: {
    skipLink: "跳到主要内容",
    home: "gup — 首页",
    github: "GitHub 上的源代码",
    install: "安装",
    copy: "复制",
    copied: "已复制！",
    copyLabel: "复制安装命令：{installCommand}",
    copyStatus: "命令已复制到剪贴板",
    copyFailed: "复制失败，请选中命令后手动复制",
    language: "语言",
    languageCurrent: "语言：{endonym}",
    newBadge: "新",
    noscript: "JavaScript 已关闭：页面内容依然完整可读，只有终端回放和复制按钮无法使用。",
  },
  nav: {
    label: "页面章节",
    features: "功能",
    coverage: "覆盖范围",
    how: "工作原理",
    faq: "常见问题",
  },
  hero: {
    eyebrow: "新功能：更新现在直接在界面内运行",
    title: { before: "一条命令。", accent: "{providers} 个来源", after: "全部保持最新。" },
    lead:
      "别再逐个折腾 **winget**、**brew**、**npm**、pip、cargo 和 helm 了。gup 并行扫描所有" +
      "来源，列出哪些已过时，再在界面内嵌的终端里实时更新你选中的软件包。",
    secondaryCta: "在 GitHub 上查看",
    trust: [
      "MIT · 开源",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "零遥测",
      "无守护进程 · 定时更新按需开启",
    ],
    terminal: {
      label: "gup 运行演示",
      tabs: { app: "界面", update: "更新", json: "JSON" },
      caption:
        "界面默认为英语，运行 `gup language fr` 即可切换为法语。命令、参数和 JSON 输出在任何" +
        "语言下都一样。",
    },
  },
  features: {
    kicker: "01 / 功能",
    title: "一切都在同一个界面中完成。",
    lead: "扫描、选择、更新、定时、回顾——gup 让你始终停留在一个全屏终端应用中。",
    items: {
      inline: {
        title: "无需离开 gup 即可更新",
        text:
          "安装程序在界面内嵌的终端面板中运行，进度条、交互提示和颜色都原样保留。更新完成的" +
          "软件包随即从列表中移除，无需重新扫描。如果内嵌终端不可用，gup 会说明原因，改在你" +
          "自己的终端中更新。",
      },
      select: {
        title: "多选，一次启动",
        text: "按 [[空格]] 勾选软件包，按 [[a]] 全选，按 [[回车]] 启动。一个队列，一份汇总。",
      },
      schedule: {
        title: "按软件包定时更新",
        text:
          "勾选软件包后按 [[p]]：`ripgrep` 每周自动更新，`node` 保持不动。定时任务只针对软件" +
          "包，从不针对整个 provider；操作系统的任务计划程序会短暂启动 gup，执行到期的任务，" +
          "没有任何常驻进程。",
      },
      journal: {
        title: "活动日志",
        text:
          "每次扫描和更新都会记录在本地。终端图表展示你的活动以及哪些软件包更新最频繁；还可" +
          "以导出日志用于排查问题。",
      },
      report: {
        title: "HTML 报告",
        text:
          "`gup report`（或在活动日志中按 [[o]]）会在浏览器中打开一份清晰、可导航的历史报告" +
          "——单个离线文件，人人都能看懂，不只是终端用户。",
      },
      themes: {
        title: "始终清晰可读的主题",
        text:
          "十个内置主题，或使用你自己的颜色：gup 会按 WCAG AA 检查每一种（文字 4.5:1，边框 " +
          "3:1，选择 AAA 时为 7:1），并修正不达标的颜色。",
      },
      os: {
        title: "了解你的操作系统",
        text:
          "无法在你的系统上运行的 provider 会显示为灰色，而不是被隐藏：在 Mac 上，仅限 " +
          "Windows 的工具会如实标明，反之亦然。",
      },
      script: {
        title: "为脚本和 CI 而生",
        text:
          "`gup list --json`、稳定的退出码、用 `-y` 跳过确认，以及绕过扫描的 " +
          "`provider:package` 目标。",
      },
    },
  },
  coverage: {
    kicker: "02 / 覆盖范围",
    title: "{providers} 个来源。三个系统。一个二进制文件。",
    lead:
      "Windows、macOS 和 Linux 上运行的是同一个可执行文件——相同的 provider 契约，相同的 " +
      "JSON。变化的只是 gup 能驱动的操作系统层。",
    delegated: "委托",
    supported: "支持的 provider",
    everywhere: "各平台一致",
    allProviders: "全部 {providers} 个 provider，按领域分类",
    catalogLink: "浏览完整的 provider 目录",
    platforms: {
      windows: {
        badge: "主要平台",
        foot: "WSL 桥接：在你的发行版中驱动 apt、dnf、pacman、Flatpak、Nix 和 Linuxbrew。",
      },
      macos: {
        badge: "原生支持",
        foot: "Apple Silicon 和 Intel · 自动解析 brew Cellar 符号链接 · `mas` 可选。",
      },
      linux: {
        badge: "原生支持",
        foot:
          "通过 `dpkg -S` 或 `rpm -qf` 找到二进制文件的归属，再把更新交还给对应的包管理器。",
      },
    },
    domains: {
      os: "系统包管理器",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET 与 PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "其他语言",
      toolchain: "版本管理器",
      cloud: "云平台 CLI",
      iac: "基础设施即代码",
      kubernetes: "Kubernetes",
      containers: "容器",
      security: "安全工具",
      "dev-cli": "开发者 CLI",
      ide: "IDE 与编辑器",
      "editor-plugins": "编辑器插件",
      "embedded-mobile": "嵌入式与移动开发",
      shell: "Shell 与提示符",
      self: "gup 自身",
    },
  },
  how: {
    kicker: "03 / 工作原理",
    title: "它是编排器，而不是又一个包管理器。",
    lead:
      "gup 并行调用各个工具自己的命令，再把结果整齐汇总。没有包注册表，没有缓存，也不会" +
      "留下任何后台进程。",
    steps: {
      scan: {
        title: "扫描",
        text:
          "每个检测到的 provider 响应 `listOutdated()`，每次并发四个。某个出错只会影响它" +
          "自己那一行。",
      },
      choose: {
        title: "选择",
        text: "按 provider 分组查看软件包，筛选、勾选——或者用 `gup update brew:fzf` 直接跳过扫描。",
      },
      update: {
        title: "更新",
        text: "原生命令以参数向量的形式运行，从不经过 shell。每一次尝试都会记入本地日志。",
      },
    },
    docsLink: "架构详解",
  },
  security: {
    kicker: "04 / 安全",
    title: "它会运行特权命令，所以设计上格外严谨。",
    lead:
      "唯一的 shell 调用入口、严格的参数向量、由测试锁定的允许列表——每次提交还要经过三款" +
      "静态分析工具。",
    items: {
      execution: {
        title: "执行",
        text: "子进程以严格的 argv 向量运行，从不使用 `shell: true`，且只经由一个经过审计的入口。",
      },
      supplyChain: {
        title: "供应链",
        text: "仅通过 HTTPS 下载，每次构建都审计依赖，每周审查依赖更新。",
      },
      analysis: {
        title: "静态分析",
        text:
          "每次提交都运行 CodeQL、Semgrep 和 eslint-plugin-security，另有一套专门验证安全" +
          "不变量的测试。",
      },
    },
    links: { policy: "安全策略", contributing: "参与贡献" },
  },
  faq: {
    kicker: "05 / 常见问题",
    title: "问题解答。",
    items: {
      replace: {
        q: "gup 会取代 winget、brew 或 npm 吗？",
        a:
          "不会。gup 在同一个界面背后编排各工具的原生命令（`winget upgrade`、" +
          "`brew outdated`、`npm update -g`、`pip list --outdated`……）。没有自创协议，也没有" +
          "版本缓存。",
      },
      platforms: {
        q: "支持 macOS 和 Linux 吗？",
        a:
          "支持。在 macOS 上原生运行：Homebrew 的 formula 与 cask、MacPorts 以及 Mac App " +
          "Store，Apple Silicon 和 Intel 均支持。在 Linux 上，系统层由 Homebrew/Linuxbrew 和 " +
          "Nix 负责，发行版安装的二进制文件会交还给 `apt` 或 `dnf` 处理。系统层之上的一切——" +
          "npm、pip、cargo、helm、VS Code……——在三个系统上的表现完全一致。",
      },
      install: {
        q: "如何安装 gup？",
        a:
          "运行 `{installCommand}`，然后用 `gup doctor` 查看检测到了哪些 provider。需要 " +
          "Node.js {nodeEngine} 或更高版本。`--allow-scripts=node-pty` 允许 node-pty 的安装" +
          "脚本运行，内嵌终端正是依靠 node-pty：不加这个参数，npm 11 会发出警告，npm 12 则会" +
          "跳过这些脚本。",
      },
      ci: {
        q: "可以在 CI 中使用 gup 吗？",
        a:
          "可以。`gup list --json --fast` 提供机器可读的输出，`gup update --all -y` 会跳过" +
          "所有确认。退出码保持稳定：`0` 表示成功，`1` 表示部分失败，`2` 表示参数无效。",
      },
      count: {
        q: "gup 支持多少个包管理器？",
        a:
          "{providers} 个 provider，每个都是独立模块：winget、scoop、chocolatey、Homebrew、" +
          "MacPorts、npm、pnpm、pip、uv、cargo、gem、composer、dotnet 工具、helm、kubectl、" +
          "terraform、VS Code 扩展、JetBrains IDE、WSL 发行版等等。",
      },
      security: {
        q: "运行它安全吗？",
        a:
          "每个子进程都经由唯一的入口，以严格的参数向量运行——从不经过 shell——并受测试锁定" +
          "的允许列表约束。CodeQL、Semgrep、gitleaks、audit-ci 和 Dependabot 持续运行。gup " +
          "不发送任何遥测数据。",
      },
      topgrade: {
        q: "它和 topgrade 有什么不同？",
        a:
          "topgrade 直接执行更新；gup 会先回答“哪些已过时，从哪个版本到哪个版本”。扫描是" +
          "独立的一步，支持 JSON 输出、逐个软件包选择、`provider:package` 目标、按软件包" +
          "定时更新，以及可随时查看的本地历史记录。",
      },
      language: {
        q: "界面是什么语言？",
        a:
          "默认为英语。`gup language fr` 会将界面切换为法语并保存这一选择；`GUP_LANG=fr` 则只对" +
          "单个 shell 生效，并优先于该选择。命令、参数和 JSON 输出与语言无关，本站提供八种语言" +
          "版本。",
      },
    },
  },
  install: {
    kicker: "06 / 安装",
    title: "三十秒，一切了然。",
    lead: "一次 npm 安装，一条命令，就能看到你机器上所有过时内容的完整清单。",
    examples: {
      menu: "全屏界面",
      listFast: "过时内容，快速扫描",
      updateAll: "全部更新，无需确认（CI）",
      target: "单个软件包，跳过扫描",
      doctor: "检测到了什么，以及如何安装其余部分",
    },
    support: {
      title: "对你有帮助吗？",
      text:
        "gup 免费、采用 MIT 许可，由我利用业余时间维护。如果它为你节省了时间，请我喝杯咖啡" +
        "或点个星标，都能让这 {providers} 个 provider 持续向前。",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "在 GitHub 上点星标",
    },
  },
  footer: {
    tagline:
      "Global Updater — 一个 CLI 管理 {providers} 个安装来源。严格模式 TypeScript、ESM、" +
      "Node ≥ {node}。",
    columns: { project: "项目", docs: "文档", technical: "技术" },
    links: {
      repo: "源代码 · GitHub",
      npm: "软件包 · npm",
      issues: "问题反馈",
      support: "获取帮助",
      contributing: "参与贡献",
      conduct: "行为准则",
      releases: "发行说明",
      installation: "安装指南",
      cli: "CLI 参考",
      providers: "Provider 目录",
      scope: "适用范围",
      architecture: "架构",
      howItWorks: "gup 工作原理",
      security: "安全",
      llms: "llms.txt",
    },
    languages: "语言",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
