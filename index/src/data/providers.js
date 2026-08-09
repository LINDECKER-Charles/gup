// Provider catalog — mirrors src/core/registry.ts (ALL_PROVIDERS).
// Shape: { id, name, category, slow?: boolean }
// The ids and the `slow` flags must match the registry exactly: the id is what
// `gup list --provider <id>` takes, and `slow` is what `--fast` skips.
export const providers = [
  // OS
  { id: "winget",          name: "Winget",                        category: "OS" },
  { id: "scoop",           name: "Scoop",                         category: "OS" },
  { id: "choco",           name: "Chocolatey",                    category: "OS" },
  { id: "msys2",           name: "MSYS2 (pacman)",                category: "OS" },
  { id: "cygwin",          name: "Cygwin",                        category: "OS" },
  { id: "npackd",          name: "Npackd",                        category: "OS" },
  { id: "brew",            name: "Homebrew",                      category: "OS" },
  { id: "brew-cask",       name: "Homebrew (casks)",              category: "OS" },
  { id: "mas",             name: "Mac App Store",                 category: "OS" },
  { id: "macports",        name: "MacPorts",                      category: "OS" },
  { id: "sparkle",         name: "Sparkle (apps macOS)",          category: "OS", slow: true },
  { id: "fink",            name: "Fink",                          category: "OS" },
  { id: "nix",             name: "Nix",                           category: "OS" },
  { id: "pkgx",            name: "pkgx",                          category: "OS" },
  { id: "pkgin",           name: "pkgin (pkgsrc)",                category: "OS" },

  // WSL
  { id: "wsl",             name: "WSL",                           category: "WSL" },
  { id: "wsl-apt",         name: "APT (WSL)",                     category: "WSL", slow: true },
  { id: "wsl-dnf",         name: "DNF (WSL)",                     category: "WSL", slow: true },
  { id: "wsl-pacman",      name: "Pacman (WSL)",                  category: "WSL", slow: true },
  { id: "wsl-brew",        name: "Brew (WSL)",                    category: "WSL", slow: true },
  { id: "wsl-flatpak",     name: "Flatpak (WSL)",                 category: "WSL", slow: true },
  { id: "wsl-nix",         name: "Nix (WSL)",                     category: "WSL", slow: true },

  // Node
  { id: "npm-g",           name: "npm global",                    category: "Node" },
  { id: "pnpm-g",          name: "pnpm global",                   category: "Node" },
  { id: "yarn-g",          name: "Yarn global",                   category: "Node", slow: true },
  { id: "bun-g",           name: "Bun global",                    category: "Node", slow: true },
  { id: "deno",            name: "Deno",                          category: "Node" },
  { id: "corepack",        name: "Corepack",                      category: "Node", slow: true },
  { id: "fnm",             name: "fnm",                           category: "Node" },
  { id: "volta",           name: "Volta",                         category: "Node" },
  { id: "nvm-windows",     name: "nvm-windows",                   category: "Node" },
  { id: "nvm",             name: "nvm (Node version manager)",    category: "Node", slow: true },

  // Python
  { id: "pip",             name: "pip",                           category: "Python" },
  { id: "pipx",            name: "pipx",                          category: "Python", slow: true },
  { id: "uv-tools",        name: "uv tools",                      category: "Python", slow: true },
  { id: "poetry",          name: "Poetry",                        category: "Python" },
  { id: "pdm",             name: "PDM",                           category: "Python" },
  { id: "rye",             name: "Rye",                           category: "Python" },
  { id: "pyenv-win",       name: "pyenv-win",                     category: "Python" },
  { id: "pyenv",           name: "pyenv",                         category: "Python" },
  { id: "conda",           name: "Conda",                         category: "Python" },

  // .NET / PHP
  { id: "dotnet-tools",    name: ".NET tools",                    category: ".NET / PHP", slow: true },
  { id: "dotnet-sdk",      name: ".NET SDK",                      category: ".NET / PHP" },
  { id: "nuget",           name: "NuGet CLI",                     category: ".NET / PHP" },
  { id: "composer-self",   name: "Composer self",                 category: ".NET / PHP" },
  { id: "composer-g",      name: "Composer (g)",                  category: ".NET / PHP" },
  { id: "symfony-cli",     name: "Symfony CLI",                   category: ".NET / PHP" },
  { id: "phive",           name: "Phive",                         category: ".NET / PHP" },

  // JVM
  { id: "jbang",           name: "JBang",                         category: "JVM" },
  { id: "coursier-cs",     name: "Coursier",                      category: "JVM" },

  // Rust
  { id: "rustup",          name: "rustup",                        category: "Rust" },
  { id: "cargo",           name: "cargo",                         category: "Rust" },

  // Other langs
  { id: "gem",             name: "RubyGems",                      category: "Other langs" },
  { id: "opam",            name: "OPAM",                          category: "Other langs", slow: true },
  { id: "hex",             name: "Hex",                           category: "Other langs" },
  { id: "mix-archive",     name: "Mix archives",                  category: "Other langs", slow: true },
  { id: "luarocks",        name: "LuaRocks",                      category: "Other langs" },
  { id: "cabal",           name: "Cabal",                         category: "Other langs" },
  { id: "stack",           name: "Stack",                         category: "Other langs" },
  { id: "nimble",          name: "Nimble",                        category: "Other langs", slow: true },
  { id: "julia-pkg",       name: "Julia Pkg",                     category: "Other langs", slow: true },
  { id: "R-packages",      name: "R packages",                    category: "Other langs", slow: true },
  { id: "vcpkg",           name: "vcpkg (C/C++)",                 category: "Other langs" },
  { id: "mint",            name: "Mint (Swift)",                  category: "Other langs", slow: true },
  { id: "flutter",         name: "Flutter",                       category: "Other langs" },
  { id: "pub-global",      name: "pub global",                    category: "Other langs", slow: true },

  // Toolchain
  { id: "goenv",           name: "goenv",                         category: "Toolchain" },
  { id: "mise",            name: "mise",                          category: "Toolchain" },
  { id: "asdf",            name: "asdf",                          category: "Toolchain" },
  { id: "proto",           name: "proto",                         category: "Toolchain", slow: true },
  { id: "sdkman",          name: "SDKMAN",                        category: "Toolchain", slow: true },
  { id: "swiftly",         name: "swiftly (Swift)",               category: "Toolchain" },

  // Cloud
  { id: "az",              name: "Azure CLI",                     category: "Cloud" },
  { id: "gcloud",          name: "gcloud",                        category: "Cloud" },
  { id: "doctl",           name: "DigitalOcean",                  category: "Cloud" },
  { id: "flyctl",          name: "Fly.io",                        category: "Cloud" },
  { id: "aws-cli-v2",      name: "AWS CLI v2",                    category: "Cloud" },
  { id: "oci-cli",         name: "OCI CLI",                       category: "Cloud" },
  { id: "scw",             name: "Scaleway",                      category: "Cloud" },
  { id: "hcloud",          name: "Hetzner",                       category: "Cloud" },
  { id: "linode-cli",      name: "Linode",                        category: "Cloud" },
  { id: "supabase",        name: "Supabase",                      category: "Cloud" },
  { id: "heroku",          name: "Heroku",                        category: "Cloud" },
  { id: "railway",         name: "Railway",                       category: "Cloud" },

  // IaC
  { id: "terraform",       name: "Terraform",                     category: "IaC" },
  { id: "opentofu",        name: "OpenTofu",                      category: "IaC" },
  { id: "terragrunt",      name: "Terragrunt",                    category: "IaC" },
  { id: "vault",           name: "Vault",                         category: "IaC" },
  { id: "consul",          name: "Consul",                        category: "IaC" },
  { id: "nomad",           name: "Nomad",                         category: "IaC" },
  { id: "packer",          name: "Packer",                        category: "IaC" },
  { id: "boundary",        name: "Boundary",                      category: "IaC" },
  { id: "tflint",          name: "tflint",                        category: "IaC" },
  { id: "pulumi",          name: "Pulumi",                        category: "IaC" },

  // Kubernetes
  { id: "helm",            name: "Helm",                          category: "Kubernetes" },
  { id: "helm-repo",       name: "Helm repos",                    category: "Kubernetes" },
  { id: "helm-plugins",    name: "Helm plugins",                  category: "Kubernetes" },
  { id: "kubectl",         name: "kubectl",                       category: "Kubernetes" },
  { id: "krew",            name: "Krew",                          category: "Kubernetes", slow: true },
  { id: "kustomize",       name: "Kustomize",                     category: "Kubernetes" },
  { id: "flux",            name: "Flux",                          category: "Kubernetes" },
  { id: "argocd",          name: "Argo CD",                       category: "Kubernetes" },
  { id: "k3d",             name: "k3d",                           category: "Kubernetes" },
  { id: "kind",            name: "kind",                          category: "Kubernetes" },
  { id: "minikube",        name: "minikube",                      category: "Kubernetes" },
  { id: "skaffold",        name: "Skaffold",                      category: "Kubernetes" },
  { id: "tilt",            name: "Tilt",                          category: "Kubernetes" },

  // Containers
  { id: "nerdctl",         name: "nerdctl",                       category: "Containers" },
  { id: "oras",            name: "ORAS",                          category: "Containers" },
  { id: "dive",            name: "dive",                          category: "Containers" },
  { id: "docker-desktop",  name: "Docker Desktop",                category: "Containers" },
  { id: "podman-desktop",  name: "Podman Desktop",                category: "Containers" },
  { id: "rancher-desktop", name: "Rancher Desktop",               category: "Containers" },

  // Security
  { id: "trivy",           name: "Trivy",                         category: "Security" },
  { id: "grype",           name: "Grype",                         category: "Security" },
  { id: "syft",            name: "Syft",                          category: "Security" },
  { id: "cosign",          name: "Cosign",                        category: "Security" },
  { id: "rekor",           name: "Rekor",                         category: "Security" },
  { id: "gitsign",         name: "gitsign",                       category: "Security" },
  { id: "nuclei",          name: "Nuclei",                        category: "Security" },
  { id: "nuclei-templates",name: "Nuclei templates",              category: "Security" },
  { id: "pdtm",            name: "PDTM",                          category: "Security" },
  { id: "semgrep",         name: "Semgrep",                       category: "Security" },

  // Dev CLIs
  { id: "lazygit",         name: "lazygit",                       category: "Dev CLIs" },
  { id: "lazydocker",      name: "lazydocker",                    category: "Dev CLIs" },
  { id: "jj",              name: "Jujutsu",                       category: "Dev CLIs" },
  { id: "delta",           name: "delta",                         category: "Dev CLIs" },
  { id: "glab",            name: "glab",                          category: "Dev CLIs" },
  { id: "tea",             name: "tea",                           category: "Dev CLIs" },
  { id: "gh-ext",          name: "gh extensions",                 category: "Dev CLIs", slow: true },
  { id: "git-for-windows", name: "Git for Windows",               category: "Dev CLIs" },

  // IDE
  { id: "vscode-ext",      name: "VS Code ext.",                  category: "IDE", slow: true },
  { id: "cursor-ext",      name: "Cursor ext.",                   category: "IDE", slow: true },
  { id: "windsurf-ext",    name: "Windsurf ext.",                 category: "IDE", slow: true },
  { id: "vscodium-ext",    name: "VSCodium ext.",                 category: "IDE", slow: true },
  { id: "jetbrains",       name: "JetBrains IDEs",                category: "IDE", slow: true },
  { id: "visual-studio",   name: "Visual Studio",                 category: "IDE" },

  // Editor plugins
  { id: "nvim-lazy",       name: "Neovim · Lazy",                 category: "Editor plugins" },
  { id: "nvim-packer",     name: "Neovim · Packer",               category: "Editor plugins" },
  { id: "nvim-mason",      name: "Neovim · Mason",                category: "Editor plugins" },
  { id: "vim-plug",        name: "Vim · Plug",                    category: "Editor plugins" },

  // Embedded / Mobile
  { id: "arduino-cli",     name: "arduino-cli",                   category: "Embedded / Mobile", slow: true },
  { id: "platformio",      name: "PlatformIO",                    category: "Embedded / Mobile" },
  { id: "android-sdk",     name: "Android SDK",                   category: "Embedded / Mobile", slow: true },
  { id: "xcodes",          name: "xcodes (Xcode version manager)",category: "Embedded / Mobile" },
  { id: "expo",            name: "Expo",                          category: "Embedded / Mobile" },
  { id: "fastlane",        name: "Fastlane",                      category: "Embedded / Mobile" },

  // Shell
  { id: "pwsh-modules",    name: "PowerShell modules",            category: "Shell", slow: true },
  { id: "psresource",      name: "PowerShell PSResourceGet",      category: "Shell", slow: true },
  { id: "oh-my-posh",      name: "oh-my-posh",                    category: "Shell" },
  { id: "starship",        name: "Starship",                      category: "Shell" },
  { id: "nerd-fonts",      name: "Nerd Fonts",                    category: "Shell", slow: true },

  // Meta
  { id: "self",            name: "Self (PM updates)",             category: "Meta", slow: true },
];
