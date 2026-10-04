/**
 * Portuguese catalog, translated from en.js (the source) into Brazilian
 * Portuguese (`lang="pt-BR"`, served as `hreflang="pt"`), addressing the
 * reader as *você*. "Scan" is "verificar" as a verb and "varredura" as a noun.
 * The provider count needs no plural object: the noun only changes for 0 and
 * 1 (never reached) and for millions. Format and rules: see en.js.
 */
export default {
  meta: {
    title: "gup — atualize winget, brew, npm e pip com um comando",
    description:
      "CLI gratuita e de código aberto que verifica e atualiza {providers} fontes — winget, " +
      "scoop, Homebrew, npm, pip, cargo, helm — em um app de terminal.",
    ogTitle: "gup — um comando, {providers} fontes atualizadas",
    ogDescription:
      "Um único binário verifica winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, " +
      "kubectl, VS Code e JetBrains — {providers} fontes em paralelo — e atualiza o que " +
      "você escolher em um terminal embutido na interface.",
    ogImageAlt:
      "gup — um comando, {providers} fontes atualizadas. CLI de código aberto para winget, " +
      "Homebrew, npm, pip, cargo e helm.",
    keywords:
      "atualizar todos os pacotes, gerenciador de pacotes, winget upgrade, brew upgrade, " +
      "npm update -g, pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, " +
      "alternativa ao topgrade",
  },
  common: {
    skipLink: "Pular para o conteúdo",
    home: "gup — início",
    github: "Código-fonte no GitHub",
    install: "Instalar",
    copy: "Copiar",
    copied: "Copiado!",
    copyLabel: "Copiar o comando de instalação: {installCommand}",
    copyStatus: "Comando copiado para a área de transferência",
    copyFailed: "Não foi possível copiar — selecione o comando e copie-o",
    language: "Idioma",
    languageCurrent: "Idioma: {endonym}",
    newBadge: "Novo",
    noscript:
      "O JavaScript está desativado: a página continua totalmente legível; só a animação do " +
      "terminal e os botões de copiar ficam inativos.",
  },
  nav: {
    label: "Seções da página",
    features: "Recursos",
    coverage: "Cobertura",
    how: "Como funciona",
    faq: "FAQ",
  },
  hero: {
    eyebrow: "Novidade — as atualizações agora rodam dentro da interface",
    title: { before: "Um comando.", accent: "{providers} fontes", after: "atualizadas." },
    lead:
      "Chega de correr atrás de **winget**, **brew** e **npm**, pip, cargo e helm. O gup " +
      "verifica todos em paralelo, mostra o que está desatualizado e atualiza o que você " +
      "escolher — ao vivo, em um terminal embutido na interface.",
    secondaryCta: "Ver no GitHub",
    trust: [
      "MIT · código aberto",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "Sem telemetria",
      "Sem daemon · agendamento opcional",
    ],
    terminal: {
      label: "gup em ação",
      tabs: { app: "Interface", update: "Atualização", json: "JSON" },
      caption:
        "A interface está em francês. Comandos, opções e a saída JSON são os mesmos em todos " +
        "os idiomas.",
    },
  },
  features: {
    kicker: "01 / RECURSOS",
    title: "Tudo acontece em uma só interface.",
    lead:
      "Verifique, escolha, atualize, agende e revise — o gup mantém você em um único app de " +
      "terminal em tela cheia.",
    items: {
      inline: {
        title: "Atualizações sem sair do gup",
        text:
          "Os instaladores rodam em um painel de terminal embutido na interface — barras de " +
          "progresso, prompts e cores intactos. Em seguida, os pacotes atualizados saem da " +
          "lista, sem nova varredura. Se o terminal embutido estiver indisponível, o gup diz " +
          "o motivo e atualiza no seu próprio terminal.",
      },
      select: {
        title: "Marque vários, execute uma vez",
        text:
          "Marque pacotes com [[Espaço]], selecione tudo com [[a]] e execute com " +
          "[[Enter]]. Uma fila, um resumo.",
      },
      schedule: {
        title: "Atualizações agendadas, pacote por pacote",
        text:
          "Marque pacotes e pressione [[p]]: o `ripgrep` passa a ser atualizado toda semana " +
          "e o `node` fica como está. Os agendamentos miram pacotes, nunca um provider " +
          "inteiro; o agendador do seu sistema inicia o gup por um instante para executar o " +
          "que está pendente, então nada fica residente.",
      },
      journal: {
        title: "Registro de atividades",
        text:
          "Cada varredura e cada atualização ficam registradas localmente. Gráficos no " +
          "terminal mostram sua atividade e quais pacotes são atualizados com mais " +
          "frequência; exporte o registro para depurar.",
      },
      report: {
        title: "Relatório HTML",
        text:
          "`gup report`, ou [[o]] no registro de atividades, abre no navegador um relatório " +
          "claro e navegável do seu histórico — um único arquivo offline, legível por " +
          "qualquer pessoa, não só por quem vive no terminal.",
      },
      themes: {
        title: "Temas que continuam legíveis",
        text:
          "Dez temas integrados ou suas próprias cores: o gup verifica cada um segundo o " +
          "WCAG AA — 4,5:1 para texto, 3:1 para bordas, 7:1 se você escolher AAA — e " +
          "corrige o que ficar abaixo do limite.",
      },
      os: {
        title: "Atento ao seu sistema",
        text:
          "Providers que não podem rodar no seu sistema aparecem esmaecidos, não ocultos: " +
          "ferramentas exclusivas do Windows aparecem como tal em um Mac, e vice-versa.",
      },
      script: {
        title: "Feito para scripts e CI",
        text:
          "`gup list --json`, códigos de saída estáveis, `-y` para pular confirmações e " +
          "alvos `provider:package` que dispensam a varredura.",
      },
    },
  },
  coverage: {
    kicker: "02 / COBERTURA",
    title: "{providers} fontes. Três sistemas. Um só binário.",
    lead:
      "O mesmo executável no Windows, macOS e Linux — mesmo contrato de provider, mesmo " +
      "JSON. O que muda é a camada do sistema que o gup consegue controlar.",
    delegated: "delegação",
    supported: "Providers compatíveis",
    everywhere: "Igual em todo lugar",
    allProviders: "Todos os {providers} providers, por domínio",
    catalogLink: "Ver o catálogo completo de providers",
    platforms: {
      windows: {
        badge: "Alvo principal",
        foot:
          "Ponte WSL: apt, dnf, pacman, Flatpak, Nix e Linuxbrew dentro das suas " +
          "distribuições.",
      },
      macos: {
        badge: "Nativo",
        foot:
          "Apple Silicon e Intel · links simbólicos do Cellar do brew resolvidos · `mas` " +
          "opcional.",
      },
      linux: {
        badge: "Nativo",
        foot:
          "O dono de um binário é identificado com `dpkg -S` ou `rpm -qf`, e a atualização " +
          "volta para esse gerenciador.",
      },
    },
    domains: {
      os: "Gerenciadores de pacotes do sistema",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET e PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "Outras linguagens",
      toolchain: "Gerenciadores de versões",
      cloud: "CLIs de nuvem",
      iac: "Infraestrutura como código",
      kubernetes: "Kubernetes",
      containers: "Contêineres",
      security: "Ferramentas de segurança",
      "dev-cli": "CLIs para desenvolvedores",
      ide: "IDEs e editores",
      "editor-plugins": "Plugins de editores",
      "embedded-mobile": "Embarcados e mobile",
      shell: "Shell e prompt",
      self: "O próprio gup",
    },
  },
  how: {
    kicker: "03 / COMO FUNCIONA",
    title: "Um orquestrador, não mais um gerenciador de pacotes.",
    lead:
      "O gup executa em paralelo os comandos de cada ferramenta e alinha as respostas. Sem " +
      "registro de pacotes, sem cache, nada rodando em segundo plano.",
    steps: {
      scan: {
        title: "Verificar",
        text:
          "Cada provider detectado responde a `listOutdated()`, quatro de cada vez. Se um " +
          "falhar, só a linha dele é afetada.",
      },
      choose: {
        title: "Escolher",
        text:
          "Revise os pacotes agrupados por provider, filtre, selecione — ou pule a " +
          "varredura com `gup update brew:fzf`.",
      },
      update: {
        title: "Atualizar",
        text:
          "Os comandos nativos rodam como um vetor de argumentos, nunca por meio de um " +
          "shell. Cada tentativa fica gravada no registro local.",
      },
    },
    docsLink: "A arquitetura em detalhes",
  },
  security: {
    kicker: "04 / SEGURANÇA",
    title: "Ele executa comandos privilegiados. E foi construído com isso em mente.",
    lead:
      "Um único ponto de chamada ao shell, vetores de argumentos estritos, uma allowlist " +
      "fixada por testes — e cada commit passa por três analisadores estáticos.",
    items: {
      execution: {
        title: "Execução",
        text:
          "Os subprocessos rodam como vetores argv estritos, nunca `shell: true`, por um " +
          "único ponto de entrada auditado.",
      },
      supplyChain: {
        title: "Cadeia de suprimentos",
        text:
          "Downloads somente via HTTPS, dependências auditadas a cada build, atualizações " +
          "revisadas toda semana.",
      },
      analysis: {
        title: "Análise estática",
        text:
          "CodeQL, Semgrep e eslint-plugin-security em cada commit, além de uma suíte de " +
          "testes dedicada às invariantes de segurança.",
      },
    },
    links: { policy: "Política de segurança", contributing: "Contribuir" },
  },
  faq: {
    kicker: "05 / FAQ",
    title: "Perguntas e respostas.",
    items: {
      replace: {
        q: "O gup substitui o winget, o brew ou o npm?",
        a:
          "Não. O gup orquestra os comandos nativos de cada ferramenta (`winget upgrade`, " +
          "`brew outdated`, `npm update -g`, `pip list --outdated`…) por trás de uma única " +
          "interface. Nenhum protocolo inventado, nenhum cache de versões.",
      },
      platforms: {
        q: "Funciona no macOS e no Linux?",
        a:
          "Sim. No macOS, de forma nativa: fórmulas e casks do Homebrew, MacPorts e a Mac " +
          "App Store, em Apple Silicon e Intel. No Linux, o Homebrew/Linuxbrew e o Nix cobrem " +
          "a camada do sistema, e um binário instalado pela distribuição é devolvido ao " +
          "`apt` ou ao `dnf`. Tudo o que fica acima da camada do sistema — npm, pip, cargo, " +
          "helm, VS Code… — se comporta da mesma forma nos três sistemas.",
      },
      install: {
        q: "Como instalo o gup?",
        a:
          "`{installCommand}` e depois `gup doctor` para ver quais providers foram " +
          "detectados. Requer Node.js {nodeEngine} ou mais recente.",
      },
      ci: {
        q: "Posso usar o gup em CI?",
        a:
          "Sim. `gup list --json --fast` gera uma saída legível por máquina e " +
          "`gup update --all -y` pula todas as confirmações. Os códigos de saída são " +
          "estáveis: `0` sucesso, `1` falha parcial, `2` argumentos inválidos.",
      },
      count: {
        q: "Quantos gerenciadores de pacotes o gup cobre?",
        a:
          "{providers} providers, cada um em um módulo isolado: winget, scoop, chocolatey, " +
          "Homebrew, MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, ferramentas dotnet, " +
          "helm, kubectl, terraform, extensões do VS Code, IDEs da JetBrains, distribuições " +
          "WSL e muito mais.",
      },
      security: {
        q: "É seguro usar?",
        a:
          "Cada subprocesso passa por um único ponto de entrada como um vetor de argumentos " +
          "estrito — nunca por um shell — com uma allowlist fixada por testes. CodeQL, " +
          "Semgrep, gitleaks, audit-ci e Dependabot rodam continuamente. O gup não envia " +
          "telemetria.",
      },
      topgrade: {
        q: "Qual é a diferença em relação ao topgrade?",
        a:
          "O topgrade executa atualizações; o gup primeiro responde “o que está " +
          "desatualizado, e de qual versão para qual”. A varredura é uma etapa separada, " +
          "com saída JSON, seleção pacote por pacote, alvos `provider:package`, " +
          "agendamentos por pacote e um histórico local que você pode consultar.",
      },
      language: {
        q: "Em que idioma está a interface?",
        a:
          "Por enquanto, a interface está em francês. Comandos, opções e a saída JSON não " +
          "dependem do idioma, e este site está disponível em oito idiomas.",
      },
    },
  },
  install: {
    kicker: "06 / INSTALAÇÃO",
    title: "Trinta segundos e você sabe de tudo.",
    lead:
      "Uma instalação via npm, um comando e a lista completa do que está desatualizado na " +
      "sua máquina.",
    examples: {
      menu: "Interface em tela cheia",
      listFast: "O que está desatualizado, varredura rápida",
      updateAll: "Tudo, sem confirmação (CI)",
      target: "Um pacote, sem varredura",
      doctor: "O que foi detectado e como instalar o resto",
    },
    support: {
      title: "Foi útil para você?",
      text:
        "O gup é gratuito, MIT e mantido no meu tempo livre. Se ele economizou seu tempo, " +
        "um café ou uma estrela ajudam a manter os {providers} providers em dia.",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "Dê uma estrela no GitHub",
    },
  },
  footer: {
    tagline:
      "Global Updater — uma CLI para {providers} fontes de instalação. TypeScript estrito, " +
      "ESM, Node ≥ {node}.",
    columns: { project: "Projeto", docs: "Documentação", technical: "Técnico" },
    links: {
      repo: "Código-fonte · GitHub",
      npm: "Pacote · npm",
      issues: "Issues",
      support: "Suporte",
      contributing: "Contribuir",
      conduct: "Código de conduta",
      releases: "Notas de versão",
      installation: "Instalação",
      cli: "Referência da CLI",
      providers: "Catálogo de providers",
      scope: "Escopo",
      architecture: "Arquitetura",
      howItWorks: "Como o gup funciona",
      security: "Segurança",
      llms: "llms.txt",
    },
    languages: "Idiomas",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
