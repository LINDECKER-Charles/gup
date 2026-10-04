/**
 * Spanish catalog, translated from en.js (the source) into neutral
 * international Spanish: *tú*, no *vosotros*, no regionalisms, opening ¿ ¡.
 * "la terminal" throughout. The provider count needs no plural object: the
 * noun only changes for 1 (never reached) and for millions. Format and
 * rules: see en.js.
 */
export default {
  meta: {
    title: "gup — actualiza winget, brew, npm y pip con un comando",
    description:
      "CLI gratuita y de código abierto que escanea y actualiza {providers} fuentes " +
      "—winget, scoop, Homebrew, npm, pip, cargo, helm— desde una app de terminal.",
    ogTitle: "gup — un comando, {providers} fuentes al día",
    ogDescription:
      "Un solo binario escanea winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, " +
      "kubectl, VS Code y JetBrains —{providers} fuentes en paralelo— y actualiza lo que " +
      "elijas en una terminal integrada en su interfaz.",
    ogImageAlt:
      "gup — un comando, {providers} fuentes al día. CLI de código abierto para winget, " +
      "Homebrew, npm, pip, cargo y helm.",
    keywords:
      "actualizar todos los paquetes, gestor de paquetes, winget upgrade, brew upgrade, " +
      "npm update -g, pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, " +
      "alternativa a topgrade",
  },
  common: {
    skipLink: "Saltar al contenido",
    home: "gup — inicio",
    github: "Código fuente en GitHub",
    install: "Instalar",
    copy: "Copiar",
    copied: "¡Copiado!",
    copyLabel: "Copiar el comando de instalación: {installCommand}",
    copyStatus: "Comando copiado al portapapeles",
    copyFailed: "No se pudo copiar: selecciona el comando y cópialo",
    language: "Idioma",
    languageCurrent: "Idioma: {endonym}",
    newBadge: "Nuevo",
    noscript:
      "JavaScript está desactivado: la página se puede leer entera; solo la animación de la " +
      "terminal y los botones de copiar quedan inactivos.",
  },
  nav: {
    label: "Secciones de la página",
    features: "Funciones",
    coverage: "Cobertura",
    how: "Cómo funciona",
    faq: "FAQ",
  },
  hero: {
    eyebrow: "Novedad: las actualizaciones ya se ejecutan dentro de la interfaz",
    title: { before: "Un comando.", accent: "{providers} fuentes", after: "al día." },
    lead:
      "Deja de perseguir a **winget**, **brew** y **npm**, pip, cargo y helm. gup los " +
      "escanea todos en paralelo, te muestra lo que está desactualizado y actualiza lo que " +
      "elijas en directo, en una terminal integrada en su interfaz.",
    secondaryCta: "Ver en GitHub",
    trust: [
      "MIT · código abierto",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "Sin telemetría",
      "Sin daemon · programación opcional",
    ],
    terminal: {
      label: "gup en acción",
      tabs: { app: "Interfaz", update: "Actualización", json: "JSON" },
      caption:
        "La interfaz está en francés. Los comandos, las opciones y la salida JSON son " +
        "iguales en todos los idiomas.",
    },
  },
  features: {
    kicker: "01 / FUNCIONES",
    title: "Todo ocurre en una sola interfaz.",
    lead:
      "Escanea, elige, actualiza, programa y revisa: gup te mantiene en una sola app de " +
      "terminal a pantalla completa.",
    items: {
      inline: {
        title: "Actualiza sin salir de gup",
        text:
          "Los instaladores se ejecutan en un panel de terminal integrado en la interfaz, " +
          "con barras de progreso, preguntas y colores intactos. Después, los paquetes " +
          "actualizados salen de la lista, sin volver a escanear. Si la terminal integrada " +
          "no está disponible, gup te dice por qué y actualiza en tu propia terminal.",
      },
      select: {
        title: "Marca varios, lanza una vez",
        text:
          "Marca paquetes con [[Espacio]], selecciona todo con [[a]] y lanza con " +
          "[[Intro]]. Una cola, un resumen.",
      },
      schedule: {
        title: "Actualizaciones programadas, paquete a paquete",
        text:
          "Marca paquetes y pulsa [[p]]: `ripgrep` pasa a actualizarse cada semana y " +
          "`node` se queda como está. Las programaciones apuntan a paquetes, nunca a un " +
          "provider entero; el programador de tareas de tu sistema inicia gup un momento " +
          "para ejecutar lo pendiente, así que nada se queda residente.",
      },
      journal: {
        title: "Registro de actividad",
        text:
          "Cada escaneo y cada actualización quedan registrados en local. Los gráficos en la " +
          "terminal muestran tu actividad y qué paquetes se actualizan más a menudo; exporta " +
          "el registro para depurar.",
      },
      report: {
        title: "Informe HTML",
        text:
          "`gup report`, o [[o]] en el registro de actividad, abre en el navegador un " +
          "informe claro y navegable de tu historial: un único archivo sin conexión, legible " +
          "por cualquiera, no solo por quien vive en la terminal.",
      },
      themes: {
        title: "Temas que siguen siendo legibles",
        text:
          "Diez temas integrados o tus propios colores: gup comprueba cada uno según WCAG AA " +
          "(4,5:1 para el texto, 3:1 para los bordes, 7:1 si eliges AAA) y corrige lo que " +
          "se queda corto.",
      },
      os: {
        title: "Atento a tu sistema",
        text:
          "Los providers que no pueden ejecutarse en tu sistema aparecen atenuados, no " +
          "ocultos: las herramientas exclusivas de Windows se muestran como tales en un Mac, " +
          "y viceversa.",
      },
      script: {
        title: "Pensado para scripts y CI",
        text:
          "`gup list --json`, códigos de salida estables, `-y` para omitir las " +
          "confirmaciones y destinos `provider:package` que se saltan el escaneo.",
      },
    },
  },
  coverage: {
    kicker: "02 / COBERTURA",
    title: "{providers} fuentes. Tres sistemas. Un solo binario.",
    lead:
      "El mismo ejecutable en Windows, macOS y Linux: el mismo contrato de provider, el " +
      "mismo JSON. Lo que cambia es la capa del sistema que gup puede controlar.",
    delegated: "delegación",
    supported: "Providers compatibles",
    everywhere: "Igual en todas partes",
    allProviders: "Los {providers} providers, por dominio",
    catalogLink: "Ver el catálogo completo de providers",
    platforms: {
      windows: {
        badge: "Objetivo principal",
        foot:
          "Puente WSL: apt, dnf, pacman, Flatpak, Nix y Linuxbrew dentro de tus " +
          "distribuciones.",
      },
      macos: {
        badge: "Nativo",
        foot:
          "Apple Silicon e Intel · enlaces simbólicos del Cellar de brew resueltos · `mas` " +
          "opcional.",
      },
      linux: {
        badge: "Nativo",
        foot:
          "El propietario de un binario se resuelve con `dpkg -S` o `rpm -qf`, y la " +
          "actualización vuelve a ese gestor.",
      },
    },
    domains: {
      os: "Gestores de paquetes del sistema",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET y PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "Otros lenguajes",
      toolchain: "Gestores de versiones",
      cloud: "CLI para la nube",
      iac: "Infraestructura como código",
      kubernetes: "Kubernetes",
      containers: "Contenedores",
      security: "Herramientas de seguridad",
      "dev-cli": "CLI para desarrolladores",
      ide: "IDE y editores",
      "editor-plugins": "Plugins de editores",
      "embedded-mobile": "Sistemas embebidos y móviles",
      shell: "Shell y prompt",
      self: "El propio gup",
    },
  },
  how: {
    kicker: "03 / CÓMO FUNCIONA",
    title: "Un orquestador, no otro gestor de paquetes.",
    lead:
      "gup ejecuta en paralelo los comandos de cada herramienta y alinea las respuestas. " +
      "Sin registro de paquetes, sin caché, nada que se quede en ejecución.",
    steps: {
      scan: {
        title: "Escanear",
        text:
          "Cada provider detectado responde a `listOutdated()`, cuatro a la vez. Si uno " +
          "falla, solo afecta a su propia fila.",
      },
      choose: {
        title: "Elegir",
        text:
          "Revisa los paquetes agrupados por provider, filtra, selecciona… o sáltate el " +
          "escaneo con `gup update brew:fzf`.",
      },
      update: {
        title: "Actualizar",
        text:
          "Los comandos nativos se ejecutan como un vector de argumentos, nunca a través de " +
          "un shell. Cada intento queda anotado en el registro local.",
      },
    },
    docsLink: "La arquitectura en detalle",
  },
  security: {
    kicker: "04 / SEGURIDAD",
    title: "Ejecuta comandos con privilegios. Está construido en consecuencia.",
    lead:
      "Un único punto de salida al shell, vectores de argumentos estrictos, una lista de " +
      "permitidos fijada por tests, y cada commit pasa por tres analizadores estáticos.",
    items: {
      execution: {
        title: "Ejecución",
        text:
          "Los subprocesos se ejecutan como vectores argv estrictos, nunca `shell: true`, a " +
          "través de un único punto de entrada auditado.",
      },
      supplyChain: {
        title: "Cadena de suministro",
        text:
          "Descargas solo por HTTPS, dependencias auditadas en cada build, actualizaciones " +
          "revisadas cada semana.",
      },
      analysis: {
        title: "Análisis estático",
        text:
          "CodeQL, Semgrep y eslint-plugin-security en cada commit, además de una batería " +
          "de tests dedicada a las invariantes de seguridad.",
      },
    },
    links: { policy: "Política de seguridad", contributing: "Contribuir" },
  },
  faq: {
    kicker: "05 / FAQ",
    title: "Preguntas y respuestas.",
    items: {
      replace: {
        q: "¿gup reemplaza a winget, brew o npm?",
        a:
          "No. gup orquesta los comandos nativos de cada herramienta (`winget upgrade`, " +
          "`brew outdated`, `npm update -g`, `pip list --outdated`…) detrás de una sola " +
          "interfaz. Sin protocolos inventados ni caché de versiones.",
      },
      platforms: {
        q: "¿Funciona en macOS y Linux?",
        a:
          "Sí. En macOS de forma nativa: fórmulas y casks de Homebrew, MacPorts y la Mac " +
          "App Store, en Apple Silicon e Intel. En Linux, Homebrew/Linuxbrew y Nix cubren la " +
          "capa del sistema, y un binario instalado por la distribución se devuelve a `apt` o " +
          "`dnf`. Todo lo que está por encima de la capa del sistema (npm, pip, cargo, helm, " +
          "VS Code…) se comporta igual en los tres sistemas.",
      },
      install: {
        q: "¿Cómo instalo gup?",
        a:
          "`{installCommand}` y luego `gup doctor` para ver qué providers se detectan. " +
          "Requiere Node.js {nodeEngine} o posterior.",
      },
      ci: {
        q: "¿Puedo usar gup en CI?",
        a:
          "Sí. `gup list --json --fast` da una salida legible por máquinas y " +
          "`gup update --all -y` omite todas las confirmaciones. Los códigos de salida son " +
          "estables: `0` éxito, `1` fallo parcial, `2` argumentos no válidos.",
      },
      count: {
        q: "¿Cuántos gestores de paquetes cubre gup?",
        a:
          "{providers} providers, cada uno en un módulo aislado: winget, scoop, chocolatey, " +
          "Homebrew, MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, herramientas " +
          "dotnet, helm, kubectl, terraform, extensiones de VS Code, IDE de JetBrains, " +
          "distribuciones WSL y muchos más.",
      },
      security: {
        q: "¿Es seguro ejecutarlo?",
        a:
          "Cada subproceso pasa por un único punto de entrada como un vector de argumentos " +
          "estricto, nunca a través de un shell, con una lista de permitidos fijada por " +
          "tests. CodeQL, Semgrep, gitleaks, audit-ci y Dependabot se ejecutan de forma " +
          "continua. gup no envía telemetría.",
      },
      topgrade: {
        q: "¿En qué se diferencia de topgrade?",
        a:
          "topgrade ejecuta actualizaciones; gup primero responde a “qué está " +
          "desactualizado, y de qué versión a cuál”. El escaneo es un paso aparte, con " +
          "salida JSON, selección paquete a paquete, destinos `provider:package`, " +
          "programaciones por paquete y un historial local que puedes revisar.",
      },
      language: {
        q: "¿En qué idioma está la interfaz?",
        a:
          "Por ahora, la interfaz está en francés. Los comandos, las opciones y la salida " +
          "JSON no dependen del idioma, y este sitio está disponible en ocho idiomas.",
      },
    },
  },
  install: {
    kicker: "06 / INSTALACIÓN",
    title: "Treinta segundos y lo sabrás todo.",
    lead:
      "Una instalación con npm, un comando y la lista completa de lo que está " +
      "desactualizado en tu máquina.",
    examples: {
      menu: "Interfaz a pantalla completa",
      listFast: "Lo desactualizado, escaneo rápido",
      updateAll: "Todo, sin confirmación (CI)",
      target: "Un paquete, sin escaneo",
      doctor: "Qué se detecta y cómo instalar el resto",
    },
    support: {
      title: "¿Te resulta útil?",
      text:
        "gup es gratuito, MIT y lo mantengo en mi tiempo libre. Si te ha ahorrado tiempo, " +
        "un café o una estrella ayudan a que los {providers} providers sigan avanzando.",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "Dale una estrella en GitHub",
    },
  },
  footer: {
    tagline:
      "Global Updater — una CLI para {providers} fuentes de instalación. TypeScript " +
      "estricto, ESM, Node ≥ {node}.",
    columns: { project: "Proyecto", docs: "Documentación", technical: "Técnico" },
    links: {
      repo: "Código fuente · GitHub",
      npm: "Paquete · npm",
      issues: "Incidencias",
      contributing: "Contribuir",
      releases: "Notas de la versión",
      installation: "Instalación",
      cli: "Referencia de la CLI",
      providers: "Catálogo de providers",
      scope: "Alcance",
      architecture: "Arquitectura",
      howItWorks: "Cómo funciona gup",
      security: "Seguridad",
      llms: "llms.txt",
    },
    languages: "Idiomas",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
