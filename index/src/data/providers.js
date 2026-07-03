// Provider catalog — source of truth: docs/how-gup-works.md §13.
// Shape: { id, name, category, slow?: boolean }
export const providers = [
  // OS / Windows
  { id: "winget",    name: "Winget",         category: "OS" },
  { id: "scoop",     name: "Scoop",          category: "OS" },
  { id: "choco",     name: "Chocolatey",     category: "OS" },

  // WSL
  { id: "wsl",         name: "WSL",          category: "WSL" },
  { id: "wsl-apt",     name: "APT (WSL)",    category: "WSL" },
  { id: "wsl-dnf",     name: "DNF (WSL)",    category: "WSL" },
  { id: "wsl-pacman",  name: "Pacman (WSL)", category: "WSL" },
  { id: "wsl-brew",    name: "Brew (WSL)",   category: "WSL" },
  { id: "wsl-flatpak", name: "Flatpak (WSL)",category: "WSL" },
  { id: "wsl-nix",     name: "Nix (WSL)",    category: "WSL" },

  // Node / JS
  { id: "npm-g",      name: "npm global",    category: "Node" },
  { id: "pnpm-g",     name: "pnpm global",   category: "Node" },
  { id: "yarn-g",     name: "Yarn global",   category: "Node" },
  { id: "bun-g",      name: "Bun global",    category: "Node" },
  { id: "deno",       name: "Deno",          category: "Node" },
  { id: "corepack",   name: "Corepack",      category: "Node" },
  { id: "fnm",        name: "fnm",           category: "Node" },
  { id: "volta",      name: "Volta",         category: "Node" },
  { id: "nvm-windows",name: "nvm-windows",   category: "Node" },

  // Python
  { id: "pip",        name: "pip",           category: "Python", slow: true },
  { id: "pipx",       name: "pipx",          category: "Python" },
  { id: "uv-tools",   name: "uv tools",      category: "Python" },
  { id: "poetry",     name: "Poetry",        category: "Python" },
  { id: "pdm",        name: "PDM",           category: "Python" },
  { id: "rye",        name: "Rye",           category: "Python" },
  { id: "pyenv-win",  name: "pyenv-win",     category: "Python" },
  { id: "conda",      name: "Conda",         category: "Python" },

  // .NET / PHP
  { id: "dotnet-tools",   name: ".NET tools",    category: ".NET / PHP" },
  { id: "composer-self",  name: "Composer self", category: ".NET / PHP" },
  { id: "composer-g",     name: "Composer (g)",  category: ".NET / PHP" },
  { id: "symfony-cli",    name: "Symfony CLI",   category: ".NET / PHP" },
  { id: "phive",          name: "Phive",         category: ".NET / PHP" },

  // JVM
  { id: "jbang",      name: "JBang",         category: "JVM" },
  { id: "coursier-cs",name: "Coursier",      category: "JVM" },

  // Rust
  { id: "rustup",     name: "rustup",        category: "Rust" },
  { id: "cargo",      name: "cargo",         category: "Rust" },

  // Other langs
  { id: "gem",          name: "RubyGems",    category: "Other langs" },
  { id: "opam",         name: "OPAM",        category: "Other langs" },
  { id: "hex",          name: "Hex",         category: "Other langs" },
  { id: "mix-archive",  name: "Mix archives",category: "Other langs" },
  { id: "luarocks",     name: "LuaRocks",    category: "Other langs" },
  { id: "cabal",        name: "Cabal",       category: "Other langs" },
  { id: "stack",        name: "Stack",       category: "Other langs" },
  { id: "nimble",       name: "Nimble",      category: "Other langs" },
  { id: "julia-pkg",    name: "Julia Pkg",   category: "Other langs" },
  { id: "r-packages",   name: "R packages",  category: "Other langs" },
  { id: "flutter",      name: "Flutter",     category: "Other langs" },
  { id: "pub-global",   name: "pub global",  category: "Other langs" },

  // Polyglot toolchains
  { id: "mise",       name: "mise",          category: "Toolchain" },
  { id: "asdf",       name: "asdf",          category: "Toolchain" },
  { id: "proto",      name: "proto",         category: "Toolchain" },
  { id: "sdkman",     name: "SDKMAN",        category: "Toolchain" },
  { id: "goenv",      name: "goenv",         category: "Toolchain" },

  // Cloud
  { id: "az",         name: "Azure CLI",     category: "Cloud" },
  { id: "gcloud",     name: "gcloud",        category: "Cloud" },
  { id: "aws-cli-v2", name: "AWS CLI v2",    category: "Cloud" },
  { id: "oci",        name: "OCI CLI",       category: "Cloud" },
  { id: "scw",        name: "Scaleway",      category: "Cloud" },
  { id: "hcloud",     name: "Hetzner",       category: "Cloud" },
  { id: "linode",     name: "Linode",        category: "Cloud" },
  { id: "doctl",      name: "DigitalOcean",  category: "Cloud" },
  { id: "supabase",   name: "Supabase",      category: "Cloud" },
  { id: "heroku",     name: "Heroku",        category: "Cloud" },
  { id: "railway",    name: "Railway",       category: "Cloud" },
  { id: "flyctl",     name: "Fly.io",        category: "Cloud" },

  // IaC
  { id: "terraform",  name: "Terraform",     category: "IaC", slow: true },
  { id: "opentofu",   name: "OpenTofu",      category: "IaC", slow: true },
  { id: "terragrunt", name: "Terragrunt",    category: "IaC", slow: true },
  { id: "vault",      name: "Vault",         category: "IaC", slow: true },
  { id: "consul",     name: "Consul",        category: "IaC", slow: true },
  { id: "nomad",      name: "Nomad",         category: "IaC", slow: true },
  { id: "packer",     name: "Packer",        category: "IaC", slow: true },
  { id: "boundary",   name: "Boundary",      category: "IaC", slow: true },
  { id: "tflint",     name: "tflint",        category: "IaC", slow: true },
  { id: "pulumi",     name: "Pulumi",        category: "IaC", slow: true },

  // Kubernetes / Helm
  { id: "helm",         name: "Helm",        category: "Kubernetes", slow: true },
  { id: "helm-repo",    name: "Helm repos",  category: "Kubernetes", slow: true },
  { id: "helm-plugins", name: "Helm plugins",category: "Kubernetes" },
  { id: "kubectl",      name: "kubectl",     category: "Kubernetes", slow: true },
  { id: "krew",         name: "Krew",        category: "Kubernetes" },
  { id: "kustomize",    name: "Kustomize",   category: "Kubernetes", slow: true },
  { id: "flux",         name: "Flux",        category: "Kubernetes", slow: true },
  { id: "argocd",       name: "Argo CD",     category: "Kubernetes", slow: true },
  { id: "k3d",          name: "k3d",         category: "Kubernetes", slow: true },
  { id: "kind",         name: "kind",        category: "Kubernetes", slow: true },
  { id: "minikube",     name: "minikube",    category: "Kubernetes", slow: true },
  { id: "skaffold",     name: "Skaffold",    category: "Kubernetes", slow: true },
  { id: "tilt",         name: "Tilt",        category: "Kubernetes", slow: true },

  // Containers
  { id: "nerdctl",         name: "nerdctl",        category: "Containers" },
  { id: "oras",            name: "ORAS",           category: "Containers", slow: true },
  { id: "dive",            name: "dive",           category: "Containers", slow: true },
  { id: "docker-desktop",  name: "Docker Desktop", category: "Containers" },
  { id: "podman-desktop",  name: "Podman Desktop", category: "Containers" },
  { id: "rancher-desktop", name: "Rancher Desktop",category: "Containers" },

  // Security
  { id: "trivy",            name: "Trivy",            category: "Security", slow: true },
  { id: "grype",            name: "Grype",            category: "Security", slow: true },
  { id: "syft",             name: "Syft",             category: "Security", slow: true },
  { id: "cosign",           name: "Cosign",           category: "Security", slow: true },
  { id: "rekor",            name: "Rekor",            category: "Security", slow: true },
  { id: "gitsign",          name: "gitsign",          category: "Security", slow: true },
  { id: "nuclei",           name: "Nuclei",           category: "Security", slow: true },
  { id: "nuclei-templates", name: "Nuclei templates", category: "Security" },
  { id: "pdtm",             name: "PDTM",             category: "Security" },
  { id: "semgrep",          name: "Semgrep",          category: "Security" },

  // Dev CLIs
  { id: "lazygit",       name: "lazygit",       category: "Dev CLIs", slow: true },
  { id: "lazydocker",    name: "lazydocker",    category: "Dev CLIs", slow: true },
  { id: "jj",            name: "Jujutsu",       category: "Dev CLIs", slow: true },
  { id: "delta",         name: "delta",         category: "Dev CLIs", slow: true },
  { id: "glab",          name: "glab",          category: "Dev CLIs", slow: true },
  { id: "tea",           name: "tea",           category: "Dev CLIs", slow: true },
  { id: "gh-extensions", name: "gh extensions", category: "Dev CLIs" },

  // IDEs / Extensions
  { id: "vscode-ext",   name: "VS Code ext.",    category: "IDE", slow: true },
  { id: "cursor-ext",   name: "Cursor ext.",     category: "IDE", slow: true },
  { id: "windsurf-ext", name: "Windsurf ext.",   category: "IDE", slow: true },
  { id: "vscodium-ext", name: "VSCodium ext.",   category: "IDE", slow: true },
  { id: "jetbrains",    name: "JetBrains IDEs",  category: "IDE" },

  // Editor plugins
  { id: "nvim-lazy",   name: "Neovim · Lazy",   category: "Editor plugins" },
  { id: "nvim-packer", name: "Neovim · Packer", category: "Editor plugins" },
  { id: "nvim-mason",  name: "Neovim · Mason",  category: "Editor plugins" },
  { id: "vim-plug",    name: "Vim · Plug",      category: "Editor plugins" },

  // Embedded / Mobile
  { id: "arduino-cli", name: "arduino-cli", category: "Embedded / Mobile" },
  { id: "platformio",  name: "PlatformIO",  category: "Embedded / Mobile" },
  { id: "android-sdk", name: "Android SDK", category: "Embedded / Mobile" },
  { id: "expo",        name: "Expo",        category: "Embedded / Mobile" },
  { id: "fastlane",    name: "Fastlane",    category: "Embedded / Mobile" },

  // Shell
  { id: "oh-my-posh",   name: "oh-my-posh",         category: "Shell", slow: true },
  { id: "starship",     name: "Starship",           category: "Shell", slow: true },
  { id: "nerd-fonts",   name: "Nerd Fonts",         category: "Shell", slow: true },
  { id: "pwsh-modules", name: "PowerShell modules", category: "Shell", slow: true },

  // Meta
  { id: "self", name: "Self (PM updates)", category: "Meta", slow: true },
];
