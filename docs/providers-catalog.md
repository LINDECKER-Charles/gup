# Catalogue des providers

Vue d'ensemble unifiée — état d'implémentation, sources et items hors scope. Source : `src/core/registry.ts` (`ALL_PROVIDERS`). Snapshot : 2026-05-19.

## Légende

| Symbole | Signification |
|---|---|
| ✅ | Intégré (enregistré dans `ALL_PROVIDERS`) |
| 🚧 | Code présent dans `src/providers/`, non câblé (sorties `manual: true` filtrées par `scanAll`) |
| ⬜ | Candidat — pas de code |
| ➡️ | Absorbé — couvert par un provider existant |
| ❌ | Hors scope |

**Hors scope global** : système d'exploitation Windows (Windows Update, WSUS, `PSWindowsUpdate`, drivers OEM, services SYSTEM, DISM, Appx provisionnés, M365 Click-to-Run) et tout ce qui est project-scoped (Maven, Gradle, sbt, bundler, `npm ci`, `pip-tools sync`, lockfiles).

---

## 1. OS / Windows

| ID | Source | Statut |
|---|---|---|
| `winget` | Windows Package Manager | ✅ |
| `scoop` | Scoop | ✅ |
| `choco` | Chocolatey | ✅ |

## 2. WSL

| ID | Cible | Statut |
|---|---|---|
| `wsl` | Kernel WSL (hôte) | ✅ |
| `wsl-apt` | apt (Debian/Ubuntu) | ✅ |
| `wsl-dnf` | dnf (Fedora) | ✅ |
| `wsl-pacman` | pacman (Arch) | ✅ |
| `wsl-brew` | Linuxbrew | ✅ |
| `wsl-flatpak` | Flatpak | ✅ |
| `wsl-nix` | Nix | ✅ |

## 3. Node.js / JavaScript

| ID | Source | Statut |
|---|---|---|
| `npm-g` | npm global | ✅ |
| `pnpm-g` | pnpm global | ✅ |
| `yarn-g` | Yarn global | ✅ |
| `bun-g` | Bun global | ✅ |
| `deno` | Deno runtime | ✅ |
| `corepack` | Corepack | ✅ |
| `fnm` | fnm | ✅ |
| `volta` | Volta | ✅ |
| `nvm-windows` | nvm-windows | ✅ |
| `vercel` | Vercel | ➡️ `npm-g` |
| `netlify` | Netlify | ➡️ `npm-g` |
| `firebase-tools` | Firebase | ➡️ `npm-g` |
| `wrangler` | Cloudflare | ➡️ `npm-g` |

## 4. Python

| ID | Source | Statut |
|---|---|---|
| `pip` | pip (user) | ✅ |
| `pipx` | pipx | ✅ |
| `uv-tools` | uv tools | ✅ |
| `poetry` | Poetry self-update | ✅ |
| `pdm` | PDM self-update | ✅ |
| `rye` | Rye self-update | ✅ |
| `pyenv-win` | pyenv-win | ✅ |
| `conda` | Conda (env base) | ✅ |

## 5. Ruby / .NET / PHP

| ID | Source | Statut |
|---|---|---|
| `gem` | RubyGems | ✅ |
| `dotnet-tools` | .NET global tools | ✅ |
| `composer-self` | Composer (binaire) | ✅ |
| `composer-g` | Composer global | ✅ |
| `symfony-cli` | Symfony CLI | ✅ |
| `phive` | PHIVE | ✅ |

## 6. JVM

| ID | Source | Statut |
|---|---|---|
| `jbang` | JBang | ✅ |
| `coursier-cs` | Coursier (Scala) | ✅ |
| `sdkman` | SDKMAN! (WSL) | ✅ |

## 7. Autres langages

| ID | Source | Statut |
|---|---|---|
| `opam` | OCaml opam | ✅ |
| `hex` | Hex (Elixir) | ✅ |
| `mix-archive` | Mix archives (Elixir) | ✅ |
| `luarocks` | LuaRocks | ✅ |
| `cabal` | cabal-install (Haskell) | ✅ |
| `stack` | Stack (Haskell) | ✅ |
| `nimble` | Nimble (Nim) | ✅ |
| `julia-pkg` | Julia Pkg | ✅ |
| `R-packages` | R / CRAN | ✅ |
| `pub-global` | Dart pub global | ✅ |
| `flutter` | Flutter SDK | ✅ |

## 8. Rust / PowerShell

| ID | Source | Statut |
|---|---|---|
| `rustup` | rustup toolchains | ✅ |
| `cargo` | cargo-update | ✅ |
| `pwsh-modules` | PSGallery (CurrentUser) | ✅ |

## 9. Toolchain polyglotte

| ID | Source | Statut |
|---|---|---|
| `mise` | mise | ✅ |
| `asdf` | asdf-vm | ✅ |
| `proto` | proto (moonrepo) | ✅ |
| `goenv` | goenv | ✅ |

## 10. Cloud CLIs

| ID | Source | Statut |
|---|---|---|
| `az` | Azure CLI (extensions) | ✅ |
| `gcloud` | gcloud components | ✅ |
| `aws-cli-v2` | AWS CLI v2 | ✅ |
| `oci-cli` | Oracle Cloud CLI | ✅ |
| `doctl` | DigitalOcean CLI | ✅ |
| `scw` | Scaleway CLI | ✅ |
| `hcloud` | Hetzner Cloud CLI | ✅ |
| `linode-cli` | Linode CLI | ✅ |
| `supabase` | Supabase CLI | ✅ |
| `heroku` | Heroku CLI | ✅ |
| `railway` | Railway CLI | ✅ |
| `flyctl` | Fly.io CLI | ✅ |

## 11. IaC / HashiCorp

| ID | Source | Statut |
|---|---|---|
| `terraform` | Terraform | ✅ |
| `opentofu` | OpenTofu | ✅ |
| `terragrunt` | Terragrunt | ✅ |
| `tflint` | TFLint | ✅ |
| `vault` | HashiCorp Vault | ✅ |
| `consul` | HashiCorp Consul | ✅ |
| `nomad` | HashiCorp Nomad | ✅ |
| `packer` | HashiCorp Packer | ✅ |
| `boundary` | HashiCorp Boundary | ✅ |
| `pulumi` | Pulumi CLI | ✅ |
| `tfsec` | TFSec | ❌ déprécié → `trivy` |
| `cdktf` / `cdk8s` / `aws-cdk` | CDKs | ➡️ `npm-g` |

## 12. Kubernetes / Helm

| ID | Source | Statut |
|---|---|---|
| `helm` | Helm | ✅ |
| `helm-repo` | Repos Helm | ✅ |
| `helm-plugins` | Plugins Helm | ✅ |
| `kubectl` | kubectl | ✅ |
| `krew` | kubectl-krew | ✅ |
| `kustomize` | Kustomize | ✅ |
| `flux` | Flux CLI | ✅ |
| `argocd` | ArgoCD CLI | ✅ |
| `k3d` | k3d | ✅ |
| `kind` | kind | ✅ |
| `minikube` | Minikube | ✅ |
| `skaffold` | Skaffold | ✅ |
| `tilt` | Tilt | ✅ |

## 13. Containers / OCI

| ID | Source | Statut |
|---|---|---|
| `nerdctl` | nerdctl (containerd) | ✅ |
| `oras` | ORAS | ✅ |
| `dive` | dive | ✅ |
| `docker-images` | Tags Docker épinglés | ✅ |
| `docker-desktop` | Docker Desktop | ✅ scan-only |
| `podman-desktop` | Podman Desktop | ✅ scan-only |
| `rancher-desktop` | Rancher Desktop | ✅ scan-only |

## 14. Sécurité / scanning

| ID | Source | Statut |
|---|---|---|
| `trivy` | Trivy | ✅ |
| `grype` | Grype | ✅ |
| `syft` | Syft | ✅ |
| `cosign` | Sigstore Cosign | ✅ |
| `rekor` | Sigstore Rekor | ✅ |
| `gitsign` | Sigstore gitsign | ✅ |
| `nuclei` | Nuclei (engine) | ✅ |
| `nuclei-templates` | Nuclei templates | ✅ |
| `pdtm` | ProjectDiscovery toolmanager | ✅ |
| `semgrep` | Semgrep | ✅ |

## 15. Dev CLIs

| ID | Source | Statut |
|---|---|---|
| `lazygit` | Lazygit | ✅ |
| `lazydocker` | Lazydocker | ✅ |
| `jj` | Jujutsu VCS | ✅ |
| `delta` | git-delta | ✅ |
| `glab` | GitLab CLI | ✅ |
| `tea` | Gitea CLI | ✅ |
| `gh-ext` | GitHub CLI extensions | ✅ |

## 16. Embarqué / Mobile

| ID | Source | Statut |
|---|---|---|
| `arduino-cli` | Arduino CLI | ✅ |
| `platformio` | PlatformIO Core | ✅ |
| `android-sdk` | Android SDK Manager | ✅ |
| `expo` | Expo CLI | ✅ |
| `fastlane` | Fastlane | ✅ |

## 17. Shell / cosmétique

| ID | Source | Statut |
|---|---|---|
| `oh-my-posh` | Oh My Posh | ✅ |
| `starship` | Starship prompt | ✅ |
| `nerd-fonts` | Nerd Fonts (per-user) | ✅ |

## 18. Éditeurs / IDE & extensions

| ID | Source | Statut |
|---|---|---|
| `vscode-ext` | VS Code Marketplace | ✅ |
| `cursor-ext` | Cursor | ✅ |
| `windsurf-ext` | Windsurf | ✅ |
| `vscodium-ext` | VSCodium + Open VSX | ✅ |
| `jetbrains` | JetBrains IDE (Toolbox + standalone) | ✅ |
| `jetbrains-plugins` | Plugins JetBrains | 🚧 |
| `zed-ext` | Zed extensions | 🚧 |
| `sublime-pc` | Sublime Package Control | 🚧 |
| `obsidian-plugins` | Obsidian community plugins | 🚧 |
| `unity-hub` | Unity Editor versions | 🚧 |
| `notepad-pp` | Plugins Notepad++ | 🚧 |
| `eclipse-marketplace` | Eclipse / p2 features | 🚧 |

## 19. Plugins éditeurs (headless)

| ID | Source | Statut |
|---|---|---|
| `nvim-lazy` | lazy.nvim | ✅ |
| `nvim-packer` | packer.nvim | ✅ |
| `nvim-mason` | mason.nvim | ✅ |
| `vim-plug` | vim-plug | ✅ |

## 20. Self-update des PM (`self:*`)

| Cible | Source latest | Update | Statut |
|---|---|---|---|
| `self:winget` | GitHub `microsoft/winget-cli` | détection-only | ✅ |
| `self:scoop` | GitHub `ScoopInstaller/Scoop` | `scoop update` | ✅ |
| `self:choco` | GitHub `chocolatey/choco` | `choco upgrade chocolatey -y` (admin) | ✅ |
| `self:npm` | npm registry | `npm install -g npm@latest` | ✅ |
| `self:pnpm` | npm registry | `pnpm add -g pnpm` | ✅ |
| `self:yarn` | npm registry | `corepack prepare yarn@stable --activate` | ✅ |
| `self:pip` | PyPI | `python -m pip install --user -U pip` | ✅ |
| `self:pipx` | PyPI | `pipx upgrade pipx` | ✅ |
| `self:gh` | GitHub `cli/cli` | délégué à la source d'install | ✅ |
| `self:symfony-cli` | — | déjà couvert par `SymfonyCliProvider` | ❌ |
| `self:rustup` | — | déjà couvert par le provider `rustup` | ❌ |
| `self:jb-toolbox` | — | auto-update GUI, pas de CLI | ❌ |

## 21. Méta-provider

| ID | Source | Statut |
|---|---|---|
| `gh-releases` | Config-driven (`gup.releases.toml`) : `<owner>/<repo>` + asset pattern + binaire local, GitHub API `releases/latest`, install user-scope (`%LOCALAPPDATA%\gup\bin`) | ⬜ |

---

## 22. Candidats à implémenter

Providers hors scope OS et hors project-scoped, compatibles avec l'infrastructure existante (`fetchGitHubReleaseLatest`, `hashicorp-releases.ts`, `pipx`, `npm-g`, `cargo`, `go install`).

### 22.1 Sécurité / scanning

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `gitleaks` | GH `gitleaks/gitleaks` | binaire | ⬜ |
| `trufflehog` | GH `trufflesecurity/trufflehog` | binaire | ⬜ |
| `osv-scanner` | GH `google/osv-scanner` | binaire | ⬜ |
| `checkov` | PyPI | pipx | ⬜ |
| `kics` | GH `Checkmarx/kics` | binaire | ⬜ |
| `terrascan` | GH `tenable/terrascan` | binaire | ⬜ |
| `conftest` | GH `open-policy-agent/conftest` | binaire | ⬜ |
| `opa` | GH `open-policy-agent/opa` | binaire | ⬜ |
| `infracost` | GH `infracost/infracost` | binaire | ⬜ |
| `kube-bench` | GH `aquasecurity/kube-bench` | binaire | ⬜ |
| `kubescape` | GH `kubescape/kubescape` | binaire | ⬜ |
| `govulncheck` | `golang.org/x/vuln/cmd/govulncheck` | `go install` | ⬜ |
| `prowler` | PyPI | pipx | ⬜ |

### 22.2 Kubernetes / ecosystem

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `k9s` | GH `derailed/k9s` | binaire | ⬜ |
| `stern` | GH `stern/stern` | binaire | ⬜ |
| `kubectx` / `kubens` | GH `ahmetb/kubectx` | binaire | ⬜ |
| `kubeseal` | GH `bitnami-labs/sealed-secrets` | binaire | ⬜ |
| `velero` | GH `vmware-tanzu/velero` | binaire | ⬜ |
| `cilium-cli` | GH `cilium/cilium-cli` | binaire | ⬜ |
| `istioctl` | GH `istio/istio` | binaire | ⬜ |
| `linkerd` | GH `linkerd/linkerd2` | binaire | ⬜ |
| `argo` | GH `argoproj/argo-workflows` | binaire | ⬜ |
| `tkn` | GH `tektoncd/cli` | binaire | ⬜ |
| `eksctl` | GH `weaveworks/eksctl` | binaire | ⬜ |
| `talosctl` | GH `siderolabs/talos` | binaire | ⬜ |
| `kops` | GH `kubernetes/kops` | binaire | ⬜ |
| `crossplane` | GH `crossplane/crossplane` | binaire | ⬜ |
| `kyverno` | GH `kyverno/kyverno` | binaire | ⬜ |

### 22.3 Containers / OCI

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `podman` | GH `containers/podman` | binaire | ⬜ |
| `buildah` | GH `containers/buildah` | binaire (WSL) | ⬜ |
| `skopeo` | GH `containers/skopeo` | binaire | ⬜ |
| `crane` | GH `google/go-containerregistry` | binaire | ⬜ |
| `regctl` | GH `regclient/regclient` | binaire | ⬜ |
| `ko` | GH `ko-build/ko` | binaire | ⬜ |
| `earthly` | GH `earthly/earthly` | binaire | ⬜ |
| `dagger` | GH `dagger/dagger` | binaire | ⬜ |

### 22.4 Migrations / SQL CLIs

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `atlas` | GH `ariga/atlas` | binaire | ⬜ |
| `dbmate` | GH `amacneil/dbmate` | binaire | ⬜ |
| `goose` | GH `pressly/goose` | binaire | ⬜ |
| `golang-migrate` | GH `golang-migrate/migrate` | binaire | ⬜ |
| `flyway` | GH `flyway/flyway` | binaire (JRE) | ⬜ |
| `pgcli` / `mycli` / `litecli` | PyPI | pipx | ⬜ |
| `usql` | GH `xo/usql` | binaire | ⬜ |

### 22.5 Cloud CLIs (gaps)

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `ibmcloud` | IBM installer | binaire | ⬜ |
| `yc` | GH `yandex-cloud/cli` | binaire | ⬜ |
| `aliyun` | GH `aliyun/aliyun-cli` | binaire | ⬜ |
| `vultr-cli` | GH `vultr/vultr-cli` | binaire | ⬜ |
| `civo` | GH `civo/cli` | binaire | ⬜ |
| `exoscale-cli` | GH `exoscale/cli` | binaire | ⬜ |
| `pscale` | GH `planetscale/cli` | binaire | ⬜ |
| `turso` | GH `tursodatabase/turso-cli` | binaire | ⬜ |
| `neonctl` | npm | ➡️ `npm-g` | absorbé |

### 22.6 Secrets / crypto / certs

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `sops` | GH `getsops/sops` | binaire | ⬜ |
| `age` | GH `FiloSottile/age` | binaire | ⬜ |
| `step` | GH `smallstep/cli` | binaire | ⬜ |
| `step-ca` | GH `smallstep/certificates` | binaire | ⬜ |
| `mkcert` | GH `FiloSottile/mkcert` | binaire | ⬜ |
| `cfssl` | GH `cloudflare/cfssl` | binaire | ⬜ |
| `bw` | GH `bitwarden/clients` | binaire | ⬜ |
| `op` | 1Password installer | binaire | ⬜ |
| `gopass` | GH `gopasspw/gopass` | binaire | ⬜ |

### 22.7 Réseau / tunneling / web

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `cloudflared` | GH `cloudflare/cloudflared` | binaire | ⬜ |
| `ngrok` | ngrok installer | binaire | ⬜ |
| `tailscale` | tailscale installer | binaire | ⬜ |
| `caddy` | GH `caddyserver/caddy` | binaire | ⬜ |
| `traefik` | GH `traefik/traefik` | binaire | ⬜ |

### 22.8 Build / task runners / CI local

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `bazelisk` | GH `bazelbuild/bazelisk` | binaire | ⬜ |
| `act` | GH `nektos/act` | binaire | ⬜ |
| `just` | GH `casey/just` | binaire | ⬜ |
| `task` | GH `go-task/task` | binaire | ⬜ |
| `mage` | GH `magefile/mage` | binaire | ⬜ |
| `pre-commit` | PyPI | pipx | ⬜ |
| `lefthook` | GH `evilmartians/lefthook` | binaire | ⬜ |

### 22.9 Observabilité

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `promtool` | GH `prometheus/prometheus` | binaire | ⬜ |
| `amtool` | GH `prometheus/alertmanager` | binaire | ⬜ |
| `otelcol` | GH `open-telemetry/opentelemetry-collector-releases` | binaire | ⬜ |
| `mimirtool` | GH `grafana/mimir` | binaire | ⬜ |
| `thanos` | GH `thanos-io/thanos` | binaire | ⬜ |
| `vmctl` | GH `VictoriaMetrics/VictoriaMetrics` | binaire | ⬜ |

### 22.10 IA / LLM tooling

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `ollama` | GH `ollama/ollama` | installer + binaire | ⬜ |
| `huggingface-cli` | PyPI | pipx | ⬜ |
| `aider` | PyPI | pipx | ⬜ |
| `@anthropic-ai/claude-code` | npm | ➡️ `npm-g` | absorbé |
| `@google/gemini-cli` | npm | ➡️ `npm-g` | absorbé |
| `replicate` | npm | ➡️ `npm-g` | absorbé |

### 22.11 Toolchains langages

| ID | Source latest | Install | Statut |
|---|---|---|---|
| `ghcup` | GH `haskell/ghcup-hs` | binaire | ⬜ |
| `zvm` | GH `tristanisham/zvm` | binaire | ⬜ |
| `solana` | GH `anza-xyz/agave` | binaire | ⬜ |
| `foundry` (`forge`/`cast`/`anvil`/`chisel`) | GH `foundry-rs/foundry` | foundryup | ⬜ |
| `tauri-cli` | crates.io | cargo | ⬜ |
| `crystal-shards` | bundled Crystal | OS pkg | ⬜ |
| `dub` | bundled D | OS pkg | ⬜ |

### 22.12 Dev UX / file utilities

`bat`, `eza`, `fd`, `ripgrep`, `fzf`, `zoxide`, `hyperfine`, `tokei`, `jq`, `yq`, `xh`, `gum`, `glow`, `direnv`, `watchexec`, `dust`, `duf`, `procs`, `bottom`, `zellij`, `helix`, `broot`, `atuin`, `pueue` → ➡️ absorbés par `winget` / `scoop` dans la majorité des installations. Provider dédié seulement si tracking GitHub spécifique requis.

---

## 23. Périmètre étendu (scope élargi)

Candidats supplémentaires au-delà du noyau dev/ops. Sources d'install indicatives, légende identique (⬜ candidat · ➡️ absorbé · ⚠️ niche/marginal · ❌ hors scope retenu).

### 23.1 Linters / formatters / qualité cross-langage

| ID | Source | Install | Statut |
|---|---|---|---|
| `shellcheck` | GH `koalaman/shellcheck` | binaire | ⬜ |
| `shfmt` | GH `mvdan/sh` | binaire | ⬜ |
| `yamllint` | PyPI | pipx | ⬜ |
| `vale` | GH `errata-ai/vale` | binaire | ⬜ |
| `proselint` | PyPI | pipx | ⬜ |
| `markdownlint-cli` | npm | ➡️ `npm-g` |
| `editorconfig-checker` | GH `editorconfig-checker/editorconfig-checker` | binaire | ⬜ |
| `ruff` | PyPI | pipx | ⬜ |
| `mypy` | PyPI | pipx | ⬜ |
| `pyright` | npm | ➡️ `npm-g` |
| `biome` | npm | ➡️ `npm-g` |
| `oxlint` | npm | ➡️ `npm-g` |
| `ast-grep` (`sg`) | GH `ast-grep/ast-grep` | binaire | ⬜ |
| `tree-sitter` | GH `tree-sitter/tree-sitter` | binaire | ⬜ |
| `codeql` | GH `github/codeql-cli-binaries` | binaire | ⬜ |
| `sonar-scanner` | sonarsource | binaire | ⬜ |
| `reviewdog` | GH `reviewdog/reviewdog` | binaire | ⬜ |
| `harper` | GH `Automattic/harper` | binaire | ⬜ |

### 23.2 Documentation / SSG

| ID | Source | Install | Statut |
|---|---|---|---|
| `pandoc` | GH `jgm/pandoc` | binaire | ⬜ |
| `hugo` | GH `gohugoio/hugo` | binaire | ⬜ |
| `zola` | GH `getzola/zola` | binaire | ⬜ |
| `mdbook` | crates.io | cargo | ⬜ |
| `mkdocs` | PyPI | pipx | ⬜ |
| `sphinx` | PyPI | pipx | ⬜ |
| `asciidoctor` | RubyGems | gem | ⬜ |
| `jekyll` | RubyGems | gem | ⬜ |
| `docusaurus` / `vitepress` / `starlight` | npm | ➡️ `npm-g` |

### 23.3 Load testing / performance / benchmarks

| ID | Source | Install | Statut |
|---|---|---|---|
| `k6` | GH `grafana/k6` | binaire | ⬜ |
| `vegeta` | GH `tsenart/vegeta` | binaire | ⬜ |
| `hey` | GH `rakyll/hey` | binaire | ⬜ |
| `wrk` | GH `wg/wrk` | binaire (WSL) | ⬜ |
| `locust` | PyPI | pipx | ⬜ |
| `artillery` | npm | ➡️ `npm-g` |
| `jmeter` | GH `apache/jmeter` | binaire (JRE) | ⬜ |

### 23.4 API / protocoles

| ID | Source | Install | Statut |
|---|---|---|---|
| `grpcurl` | GH `fullstorydev/grpcurl` | binaire | ⬜ |
| `evans` | GH `ktr0731/evans` | binaire | ⬜ |
| `buf` | GH `bufbuild/buf` | binaire | ⬜ |
| `protoc` | GH `protocolbuffers/protobuf` | binaire | ⬜ |
| `protolint` | GH `yoheimuta/protolint` | binaire | ⬜ |
| `openapi-generator` | GH `OpenAPITools/openapi-generator` | binaire (JRE) | ⬜ |
| `spectral` | npm | ➡️ `npm-g` |
| `newman` | npm | ➡️ `npm-g` |
| `bruno` | GH `usebruno/bruno` | binaire | ⬜ |
| `hurl` | GH `Orange-OpenSource/hurl` | binaire | ⬜ |
| `pact-cli` | GH `pact-foundation/pact-ruby-standalone` | binaire | ⬜ |

### 23.5 Backup / sync / filesystem

| ID | Source | Install | Statut |
|---|---|---|---|
| `restic` | GH `restic/restic` | binaire | ⬜ |
| `borg` | GH `borgbackup/borg` | binaire (WSL) | ⬜ |
| `kopia` | GH `kopia/kopia` | binaire | ⬜ |
| `rclone` | GH `rclone/rclone` | binaire | ⬜ |
| `syncthing` | GH `syncthing/syncthing` | binaire | ⬜ |
| `duplicacy` | GH `gilbertchen/duplicacy` | binaire | ⚠️ commercial |
| `yazi` | GH `sxyazi/yazi` | binaire | ⬜ |
| `xplr` | GH `sayanarijit/xplr` | binaire | ⬜ |

### 23.6 Workflow / data orchestration / ETL

| ID | Source | Install | Statut |
|---|---|---|---|
| `dbt-core` | PyPI | pipx | ⬜ |
| `dlt` | PyPI | pipx | ⬜ |
| `airflow` | PyPI | pipx | ⚠️ project-scoped |
| `prefect` | PyPI | pipx | ⚠️ project-scoped |
| `dagster` | PyPI | pipx | ⚠️ project-scoped |
| `meltano` | PyPI | pipx | ⬜ |
| `airbyte` | GH `airbytehq/airbyte` | binaire | ⬜ |
| `temporal` | GH `temporalio/cli` | binaire | ⬜ |
| `duckdb` | GH `duckdb/duckdb` | binaire | ⬜ |

### 23.7 ML / MLOps

| ID | Source | Install | Statut |
|---|---|---|---|
| `mlflow` | PyPI | pipx | ⬜ |
| `wandb` | PyPI | pipx | ⬜ |
| `dvc` | PyPI | pipx | ⬜ |
| `bentoml` | PyPI | pipx | ⬜ |
| `ray` | PyPI | pipx | ⬜ |
| `modal` | PyPI | pipx | ⬜ |
| `runpodctl` | GH `runpod/runpodctl` | binaire | ⬜ |
| `replicate` | npm | ➡️ `npm-g` |
| `vast-ai` | PyPI | pipx | ⚠️ niche |

### 23.8 Identity / IAM

| ID | Source | Install | Statut |
|---|---|---|---|
| `keycloak` (kcadm) | GH `keycloak/keycloak` | binaire (JRE) | ⬜ |
| `ory` | GH `ory/cli` | binaire | ⬜ |
| `zitadel` | GH `zitadel/zitadel` | binaire | ⬜ |
| `authelia` | GH `authelia/authelia` | binaire | ⬜ |
| `aws-vault` | GH `99designs/aws-vault` | binaire | ⬜ |
| `gimme-aws-creds` | PyPI | pipx | ⬜ |
| `okta-cli` | GH `okta/okta-cli` | binaire (JRE) | ⬜ |

### 23.9 Web3 / blockchain

| ID | Source | Install | Statut |
|---|---|---|---|
| `foundry` | GH `foundry-rs/foundry` | foundryup | ⬜ (déjà §22.11) |
| `hardhat` | npm | ➡️ `npm-g` |
| `truffle` | npm | ➡️ `npm-g` |
| `solana` | GH `anza-xyz/agave` | binaire | ⬜ (déjà §22.11) |
| `anchor` | npm | ➡️ `npm-g` |
| `aptos` | GH `aptos-labs/aptos-core` | binaire | ⬜ |
| `sui` | GH `MystenLabs/sui` | binaire | ⬜ |
| `starkli` | GH `xJonathanLEI/starkli` | binaire | ⬜ |
| `cosmos` (`gaiad`, `simd`) | GH `cosmos/cosmos-sdk` | binaire | ⚠️ niche |
| `bitcoin-cli` | GH `bitcoin/bitcoin` | binaire | ⚠️ niche |
| `nostr-tools` | npm | ➡️ `npm-g` |

### 23.10 Hardware / embedded / IoT

| ID | Source | Install | Statut |
|---|---|---|---|
| `esptool` | PyPI | pipx | ⬜ |
| `west` (Zephyr) | PyPI | pipx | ⬜ |
| `probe-rs` | crates.io | cargo | ⬜ |
| `openocd` | GH `openocd-org/openocd` | binaire | ⬜ |
| `nrfutil` | nordicsemi | binaire | ⚠️ niche |
| `balena` | GH `balena-io/balena-cli` | binaire | ⬜ |
| `particle` | npm | ➡️ `npm-g` |
| `ros2` | OS pkg | apt/winget | ⚠️ niche |

### 23.11 Config-as-code

| ID | Source | Install | Statut |
|---|---|---|---|
| `cue` | GH `cue-lang/cue` | binaire | ⬜ |
| `jsonnet` (`go-jsonnet`) | GH `google/go-jsonnet` | binaire | ⬜ |
| `dhall` | GH `dhall-lang/dhall-haskell` | binaire | ⬜ |
| `nickel` | GH `tweag/nickel` | binaire | ⬜ |
| `pkl` | GH `apple/pkl` | binaire | ⬜ |

### 23.12 Vector DBs / search engines (clients)

| ID | Source | Install | Statut |
|---|---|---|---|
| `meilisearch` | GH `meilisearch/meilisearch` | binaire | ⬜ |
| `typesense` | GH `typesense/typesense` | binaire | ⬜ |
| `qdrant` | GH `qdrant/qdrant` | binaire | ⬜ |
| `weaviate` | GH `weaviate/weaviate` | binaire | ⬜ |
| `algolia` (`@algolia/cli`) | npm | ➡️ `npm-g` |

### 23.13 PaaS / self-hosted dev infra

| ID | Source | Install | Statut |
|---|---|---|---|
| `coolify-cli` | npm | ➡️ `npm-g` |
| `caprover` | npm | ➡️ `npm-g` |
| `dokku` | GH `dokku/dokku` | binaire (WSL) | ⬜ |
| `okteto` | GH `okteto/okteto` | binaire | ⬜ |
| `devspace` | GH `devspace-sh/devspace` | binaire | ⬜ |
| `garden` | GH `garden-io/garden` | binaire | ⬜ |
| `nitric` | GH `nitrictech/cli` | binaire | ⬜ |

### 23.14 Mobile / cross-platform testing

| ID | Source | Install | Statut |
|---|---|---|---|
| `maestro` | GH `mobile-dev-inc/maestro` | binaire | ⬜ |
| `appium` | npm | ➡️ `npm-g` |
| `detox` | npm | ➡️ `npm-g` |
| `patrol` | pub.dev | `pub-global` |
| `playwright` | npm | ➡️ `npm-g` |
| `cypress` | npm | ➡️ `npm-g` |

### 23.15 Service mesh / API gateway

| ID | Source | Install | Statut |
|---|---|---|---|
| `deck` (Kong) | GH `Kong/deck` | binaire | ⬜ |
| `tyk-cli` | GH `TykTechnologies/tyk` | binaire | ⬜ |
| `kuma` (`kumactl`) | GH `kumahq/kuma` | binaire | ⬜ |

### 23.16 Médias / utilitaires

| ID | Source | Install | Statut |
|---|---|---|---|
| `ffmpeg` | scoop/winget | ➡️ |
| `yt-dlp` | GH `yt-dlp/yt-dlp` | binaire / pipx | ⬜ |
| `gallery-dl` | PyPI | pipx | ⬜ |
| `streamlink` | PyPI | pipx | ⬜ |
| `imagemagick` | winget | ➡️ |
| `exiftool` | winget | ➡️ |
| `mediainfo` | winget | ➡️ |

### 23.17 Langages niche

| ID | Source | Install | Statut |
|---|---|---|---|
| `gleam` | GH `gleam-lang/gleam` | binaire | ⬜ |
| `roc` | GH `roc-lang/roc` | binaire | ⚠️ pre-1.0 |
| `v` (vlang) | GH `vlang/v` | binaire | ⬜ |
| `carbon` | GH `carbon-language/carbon-lang` | source | ⚠️ experimental |
| `unison` | GH `unisonweb/unison` | binaire | ⚠️ niche |
| `purescript` (`spago`) | npm | ➡️ `npm-g` |
| `elm` | npm | ➡️ `npm-g` |
| `idris2` | GH `idris-lang/Idris2` | source | ⚠️ niche |

### 23.18 Réseau / analyse

| ID | Source | Install | Statut |
|---|---|---|---|
| `iperf3` | winget/scoop | ➡️ |
| `mtr` | OS pkg (WSL) | ➡️ |
| `tshark` | winget (Wireshark) | ➡️ |
| `speedtest-cli` | PyPI | pipx | ⬜ |
| `bandwhich` | crates.io | cargo | ⬜ |

### 23.19 Sécurité offensive (gray-zone)

> ⚠️ Outils duaux pentesting/red-team. Implémentation conditionnelle à un usage déclaré (audit autorisé, CTF, recherche). Hors scope par défaut sauf demande explicite.

| ID | Source | Install | Statut |
|---|---|---|---|
| `nmap` | winget/scoop | ➡️ |
| `masscan` | GH `robertdavidgraham/masscan` | binaire | ⚠️ |
| `amass` | GH `owasp-amass/amass` | binaire | ⚠️ |
| `ffuf` | GH `ffuf/ffuf` | binaire | ⚠️ |
| `gobuster` | GH `OJ/gobuster` | binaire | ⚠️ |
| `sqlmap` | PyPI | pipx | ⚠️ |
| `hashcat` | hashcat.net | binaire | ⚠️ |
| `john` | GH `openwall/john` | binaire | ⚠️ |
| `aircrack-ng` | aircrack-ng.org | binaire (WSL) | ⚠️ |
| `metasploit` | rapid7 | installer | ❌ retenu hors scope (lourd, sensible) |
| `mimikatz` / `responder` / `bloodhound` | divers | binaire | ❌ retenu hors scope |

### 23.20 Game / créatif

| ID | Source | Install | Statut |
|---|---|---|---|
| `godot` | GH `godotengine/godot` | binaire | ⬜ |
| `love2d` | GH `love2d/love` | binaire | ⬜ |
| `defold` | GH `defold/defold` | binaire | ⬜ |
| `blender` / `obs` / `audacity` / `davinci` | winget | ➡️ |

### 23.21 Productivité / notes (CLI uniquement)

| ID | Source | Install | Statut |
|---|---|---|---|
| `joplin` | npm (CLI) | ➡️ `npm-g` |
| `silverbullet` | Deno | deno | ⬜ |
| `logseq` | winget | ➡️ |

---

## 24. Inventaire exhaustif niche (scope élargi maximal)

Compléments aux §22-23. Tous candidats ⬜ sauf indication contraire. Sécurité offensive / dual-use exclue ou marquée ⚠️ avec usage défensif uniquement (forensics, RE, audit). Items déjà listés en §22-23 ne sont pas répétés.

### 24.1 Gestionnaires de versions / runtime managers (additions)

| ID | Source | Install | Statut |
|---|---|---|---|
| `mamba` | GH `mamba-org/mamba` | binaire | ⬜ |
| `micromamba` | GH `mamba-org/mamba` | binaire | ⬜ |
| `pixi` | GH `prefix-dev/pixi` | binaire | ⬜ |
| `jenv` | GH `jenv/jenv` | binaire (WSL) | ⬜ |
| `jabba` | GH `shyiko/jabba` | binaire | ⬜ |
| `rbenv` | GH `rbenv/rbenv` | binaire (WSL) | ⬜ |
| `rvm` | rvm.io | script (WSL) | ⬜ |
| `chruby` | GH `postmodern/chruby` | binaire (WSL) | ⬜ |
| `frum` | GH `TaKO8Ki/frum` | binaire | ⬜ |
| `nodenv` | GH `nodenv/nodenv` | binaire (WSL) | ⬜ |
| `phpenv` | GH `phpenv/phpenv` | binaire (WSL) | ⬜ |
| `crenv` | GH `crenv/crenv` | binaire (WSL) | ⬜ |
| `kerl` | GH `kerl/kerl` | binaire (WSL) | ⬜ |
| `choosenim` | GH `nim-lang/choosenim` | binaire | ⬜ |
| `swiftenv` | GH `kylef/swiftenv` | binaire (WSL) | ⬜ |
| `roswell` | GH `roswell/roswell` | binaire | ⬜ |
| `gvm` | GH `moovweb/gvm` | binaire (WSL) | ⬜ |
| `g` (go) | GH `stefanmaric/g` | npm | ⬜ |
| `goup` | GH `owenthereal/goup` | binaire | ⬜ |
| `perlbrew` | GH `gugod/App-perlbrew` | script (WSL) | ⬜ |
| `plenv` | GH `tokuhirom/plenv` | binaire (WSL) | ⬜ |

### 24.2 Git tooling étendu

| ID | Source | Install | Statut |
|---|---|---|---|
| `gitui` | GH `extrawurst/gitui` | binaire | ⬜ |
| `gex` | GH `Piturnah/gex` | binaire | ⬜ |
| `onefetch` | GH `o2sh/onefetch` | binaire | ⬜ |
| `git-cliff` | GH `orhun/git-cliff` | binaire | ⬜ |
| `typos` | GH `crate-ci/typos` | binaire | ⬜ |
| `difftastic` | GH `Wilfred/difftastic` | binaire | ⬜ |
| `git-machete` | PyPI | pipx | ⬜ |
| `git-trim` | GH `foriequal0/git-trim` | binaire | ⬜ |
| `git-absorb` | GH `tummychow/git-absorb` | binaire | ⬜ |
| `git-imerge` | GH `mhagger/git-imerge` | pipx | ⬜ |
| `git-revise` | PyPI | pipx | ⬜ |
| `git-branchless` | GH `arxanas/git-branchless` | binaire | ⬜ |
| `git-bug` | GH `MichaelMure/git-bug` | binaire | ⬜ |
| `git-town` | GH `git-town/git-town` | binaire | ⬜ |
| `commitlint` | npm | ➡️ `npm-g` |
| `semantic-release` | npm | ➡️ `npm-g` |
| `release-please` | npm | ➡️ `npm-g` |
| `conventional-changelog-cli` | npm | ➡️ `npm-g` |

### 24.3 Shells / multiplexeurs / terminaux

| ID | Source | Install | Statut |
|---|---|---|---|
| `nushell` | GH `nushell/nushell` | binaire | ⬜ |
| `xonsh` | PyPI | pipx | ⬜ |
| `elvish` | GH `elves/elvish` | binaire | ⬜ |
| `oils` (`osh`/`ysh`) | GH `oils-for-unix/oils` | binaire (WSL) | ⬜ |
| `murex` | GH `lmorg/murex` | binaire | ⬜ |
| `fish` | winget/scoop | ➡️ |
| `tmux` | OS pkg (WSL) | ➡️ |
| `mosh` | OS pkg (WSL) | ➡️ |
| `alacritty` | winget | ➡️ |
| `wezterm` | winget | ➡️ |
| `kitty` | OS pkg | ➡️ |
| `ghostty` | GH `ghostty-org/ghostty` | binaire | ⬜ |

### 24.4 Charm / TUI ecosystem

| ID | Source | Install | Statut |
|---|---|---|---|
| `gum` | GH `charmbracelet/gum` | binaire | ⬜ |
| `glow` | GH `charmbracelet/glow` | binaire | ⬜ |
| `vhs` | GH `charmbracelet/vhs` | binaire | ⬜ |
| `mods` | GH `charmbracelet/mods` | binaire | ⬜ |
| `pop` | GH `charmbracelet/pop` | binaire | ⬜ |
| `huh` (CLI demos) | GH `charmbracelet/huh` | binaire | ⬜ |
| `skate` | GH `charmbracelet/skate` | binaire | ⬜ |
| `soft-serve` | GH `charmbracelet/soft-serve` | binaire | ⬜ |
| `wishlist` | GH `charmbracelet/wishlist` | binaire | ⬜ |
| `freeze` | GH `charmbracelet/freeze` | binaire | ⬜ |

### 24.5 Monitoring système / TUI

| ID | Source | Install | Statut |
|---|---|---|---|
| `htop` | OS pkg | ➡️ apt |
| `btop` | winget | ➡️ |
| `glances` | PyPI | pipx | ⬜ |
| `atop` / `iotop` | apt | ➡️ |
| `nvtop` | GH `Syllo/nvtop` | binaire (WSL) | ⬜ |
| `gpustat` | PyPI | pipx | ⬜ |
| `nethogs` / `iftop` | apt | ➡️ |
| `fastfetch` | GH `fastfetch-cli/fastfetch` | binaire | ⬜ |
| `neofetch` | GH `dylanaraps/neofetch` | binaire | ⬜ |
| `macchina` | GH `Macchina-CLI/macchina` | binaire | ⬜ |
| `ncdu` | OS pkg | ➡️ |
| `gping` | GH `orf/gping` | binaire | ⬜ |
| `procs` | GH `dalance/procs` | binaire | ⬜ |
| `bandwhich` | GH `imsnif/bandwhich` | binaire | ⬜ |
| `dog` (DNS) | GH `ogham/dog` | binaire | ⬜ |
| `doggo` (DNS) | GH `mr-karan/doggo` | binaire | ⬜ |

### 24.6 File managers / recherche

| ID | Source | Install | Statut |
|---|---|---|---|
| `nnn` | GH `jarun/nnn` | binaire (WSL) | ⬜ |
| `ranger` | PyPI | pipx | ⬜ |
| `lf` | GH `gokcehan/lf` | binaire | ⬜ |
| `vifm` | OS pkg | ➡️ |
| `joshuto` | GH `kamiyaa/joshuto` | binaire | ⬜ |
| `tre` | GH `dduan/tre` | binaire | ⬜ |
| `pls` | GH `dhruvkb/pls` | binaire | ⬜ |
| `mc` (Midnight Commander) | OS pkg | ➡️ |

### 24.7 Manipulation données / parseurs

| ID | Source | Install | Statut |
|---|---|---|---|
| `jc` | PyPI | pipx | ⬜ |
| `gron` | GH `tomnomnom/gron` | binaire | ⬜ |
| `fx` | GH `antonmedv/fx` | binaire | ⬜ |
| `dasel` | GH `TomWright/dasel` | binaire | ⬜ |
| `jless` | GH `PaulJuliusMartinez/jless` | binaire | ⬜ |
| `jaq` | GH `01mf02/jaq` | binaire | ⬜ |
| `htmlq` | GH `mgdm/htmlq` | binaire | ⬜ |
| `xq` | GH `kislyuk/yq` | pipx | ⬜ |
| `xidel` | GH `benibela/xidel` | binaire | ⬜ |
| `xsv` | GH `BurntSushi/xsv` | binaire | ⬜ |
| `miller` (`mlr`) | GH `johnkerl/miller` | binaire | ⬜ |
| `csvkit` | PyPI | pipx | ⬜ |
| `visidata` | PyPI | pipx | ⬜ |
| `termgraph` | PyPI | pipx | ⬜ |
| `polars-cli` | crates.io | cargo | ⬜ |

### 24.8 SBOM / supply chain

| ID | Source | Install | Statut |
|---|---|---|---|
| `cyclonedx-cli` | GH `CycloneDX/cyclonedx-cli` | binaire | ⬜ |
| `cdxgen` | npm | ➡️ `npm-g` |
| `sbom-tool` | GH `microsoft/sbom-tool` | binaire | ⬜ |
| `spdx-tools` | PyPI | pipx | ⬜ |
| `in-toto` | PyPI | pipx | ⬜ |
| `slsa-verifier` | GH `slsa-framework/slsa-verifier` | binaire | ⬜ |
| `scorecard` | GH `ossf/scorecard` | binaire | ⬜ |
| `allstar` | GH `ossf/allstar` | GH app | ⚠️ |

### 24.9 Container / image linters (défensif)

| ID | Source | Install | Statut |
|---|---|---|---|
| `hadolint` | GH `hadolint/hadolint` | binaire | ⬜ |
| `dockle` | GH `goodwithtech/dockle` | binaire | ⬜ |
| `container-structure-test` | GH `GoogleContainerTools/container-structure-test` | binaire | ⬜ |

### 24.10 Forensics / DFIR (défensif)

| ID | Source | Install | Statut |
|---|---|---|---|
| `volatility3` | PyPI | pipx | ⬜ |
| `yara` | GH `VirusTotal/yara` | binaire | ⬜ |
| `yara-x` | GH `VirusTotal/yara-x` | binaire | ⬜ |
| `chainsaw` | GH `WithSecureLabs/chainsaw` | binaire | ⬜ |
| `velociraptor` | GH `Velocidex/velociraptor` | binaire | ⬜ |
| `osquery` | GH `osquery/osquery` | binaire | ⬜ |
| `plaso` (`log2timeline`) | PyPI | pipx | ⬜ |
| `timesketch-cli` | PyPI | pipx | ⬜ |
| `sleuthkit` | GH `sleuthkit/sleuthkit` | binaire (WSL) | ⬜ |
| `clamav` | winget | ➡️ |
| `lynis` | GH `CISOfy/lynis` | binaire (WSL) | ⬜ |
| `rkhunter` / `chkrootkit` | apt | ➡️ |
| `wazuh-agent` | wazuh.com | binaire | ⬜ |
| `aurora-agent` | GH `Neo23x0/aurora` | binaire | ⬜ |

### 24.11 Reverse engineering / binary analysis (dual-use, défensif)

> ⚠️ Outils duaux audit / malware analysis. Implémentation conditionnelle à un usage déclaré (recherche, CTF, threat intel).

| ID | Source | Install | Statut |
|---|---|---|---|
| `radare2` | winget | ➡️ ⚠️ |
| `rizin` | GH `rizinorg/rizin` | binaire | ⚠️ |
| `ghidra` | GH `NationalSecurityAgency/ghidra` | binaire (JRE) | ⚠️ |
| `binwalk` | PyPI | pipx | ⚠️ |
| `cutter` | GH `rizinorg/cutter` | binaire | ⚠️ |
| `iaito` | GH `radareorg/iaito` | binaire | ⚠️ |

### 24.12 Hyperviseurs / VM CLIs

| ID | Source | Install | Statut |
|---|---|---|---|
| `vagrant` | GH `hashicorp/vagrant` | binaire | ⬜ |
| `multipass` | GH `canonical/multipass` | installer | ⬜ |
| `vboxmanage` (VirtualBox) | virtualbox.org | bundled | ⬜ |
| `govc` (vSphere) | GH `vmware/govmomi` | binaire | ⬜ |
| `virsh` (libvirt) | apt | ➡️ |
| `qm` (Proxmox) | proxmox | bundled | ⬜ |
| `firecracker` | GH `firecracker-microvm/firecracker` | binaire (WSL) | ⬜ |
| `ignite` (Firecracker via Weave) | GH `weaveworks/ignite` | binaire | ⬜ |
| `lxc` / `incus` | linuxcontainers.org | apt (WSL) | ➡️ |
| `distrobox` | GH `89luca89/distrobox` | binaire (WSL) | ⬜ |
| `toolbox` | GH `containers/toolbox` | binaire (WSL) | ⬜ |

### 24.13 Bases de données — clients & shells

| ID | Source | Install | Statut |
|---|---|---|---|
| `mongosh` | GH `mongodb-js/mongosh` | binaire | ⬜ |
| `mongo-tools` | GH `mongodb/mongo-tools` | binaire | ⬜ |
| `cqlsh` (Cassandra) | apache | bundled | ⬜ |
| `influx` CLI | GH `influxdata/influx-cli` | binaire | ⬜ |
| `redis-cli` / `redis-tools` | OS pkg | ➡️ |
| `valkey-cli` | GH `valkey-io/valkey` | binaire | ⬜ |
| `clickhouse-client` | GH `ClickHouse/ClickHouse` | binaire | ⬜ |
| `cockroach` | GH `cockroachdb/cockroach` | binaire | ⬜ |
| `mysqlsh` | dev.mysql.com | binaire | ⬜ |
| `mariadb-cli` | mariadb.org | binaire | ⬜ |
| `neo4j-admin` / `cypher-shell` | neo4j.com | bundled | ⬜ |
| `arangosh` | arangodb.com | bundled | ⬜ |
| `surreal` (SurrealDB) | GH `surrealdb/surrealdb` | binaire | ⬜ |

### 24.14 PostgreSQL / migration extensions

| ID | Source | Install | Statut |
|---|---|---|---|
| `gh-ost` | GH `github/gh-ost` | binaire | ⬜ |
| `pt-online-schema-change` | percona.com | binaire | ⬜ |
| `mydumper` / `myloader` | GH `mydumper/mydumper` | binaire | ⬜ |
| `pgloader` | GH `dimitri/pgloader` | binaire | ⬜ |
| `pgbouncer` | GH `pgbouncer/pgbouncer` | binaire (WSL) | ⬜ |
| `pgcat` | GH `postgresml/pgcat` | binaire | ⬜ |
| `pg_partman` | GH `pgpartman/pg_partman` | extension | ⬜ |
| `pgmetrics` | GH `rapidloop/pgmetrics` | binaire | ⬜ |
| `pgbadger` | GH `darold/pgbadger` | binaire (Perl) | ⬜ |
| `pgcenter` | GH `lesovsky/pgcenter` | binaire | ⬜ |

### 24.15 Messaging / brokers / streaming (clients)

| ID | Source | Install | Statut |
|---|---|---|---|
| `kcat` (ex `kafkacat`) | GH `edenhill/kcat` | binaire | ⬜ |
| `kafkactl` | GH `deviceinsight/kafkactl` | binaire | ⬜ |
| `redpanda-rpk` | GH `redpanda-data/redpanda` | binaire | ⬜ |
| `nats-cli` | GH `nats-io/natscli` | binaire | ⬜ |
| `nsq` (`nsq_to_*`) | GH `nsqio/nsq` | binaire | ⬜ |
| `pulsar-shell` | GH `apache/pulsar` | bundled | ⬜ |
| `mosquitto` (`mosquitto_pub/sub`) | mosquitto.org | binaire | ⬜ |
| `mqtt-cli` | GH `hivemq/mqtt-cli` | binaire (JRE) | ⬜ |
| `centrifugo` | GH `centrifugal/centrifugo` | binaire | ⬜ |
| `debezium-cli` | GH `debezium/debezium` | binaire | ⬜ |

### 24.16 Search engines (serveurs + clients)

| ID | Source | Install | Statut |
|---|---|---|---|
| `elasticsearch` | elastic.co | binaire | ⬜ |
| `opensearch` | GH `opensearch-project/OpenSearch` | binaire | ⬜ |
| `solr` | GH `apache/solr` | binaire (JRE) | ⬜ |
| `zinc` | GH `zincsearch/zincsearch` | binaire | ⬜ |
| `quickwit` | GH `quickwit-oss/quickwit` | binaire | ⬜ |
| `vespa-cli` | GH `vespa-engine/vespa` | binaire | ⬜ |
| `sonic` | GH `valeriansaliou/sonic` | binaire | ⬜ |

### 24.17 LLM / AI CLIs étendus

| ID | Source | Install | Statut |
|---|---|---|---|
| `llm` (Simon Willison) | PyPI | pipx | ⬜ |
| `shell-gpt` (`sgpt`) | PyPI | pipx | ⬜ |
| `aichat` | crates.io | cargo | ⬜ |
| `mods` (Charm) | ✓ §24.4 |
| `chatgpt-cli` | GH `j178/chatgpt` | binaire | ⬜ |
| `gh-copilot` | gh extension | ➡️ `gh-ext` |
| `gh-models` | gh extension | ➡️ `gh-ext` |
| `whisper.cpp` (`main`) | GH `ggerganov/whisper.cpp` | binaire | ⬜ |
| `whisperx` | PyPI | pipx | ⬜ |
| `piper` (TTS) | GH `rhasspy/piper` | binaire | ⬜ |
| `bark` | PyPI | pipx | ⬜ |
| `autogen` | PyPI | pipx | ⬜ |
| `crewai` | PyPI | pipx | ⬜ |
| `dspy` | PyPI | pipx | ⬜ |
| `swe-agent` | GH `SWE-agent/SWE-agent` | manuel | ⚠️ |
| `comfyui` | GH `comfyanonymous/ComfyUI` | manuel | ⚠️ |
| `automatic1111` | GH `AUTOMATIC1111/stable-diffusion-webui` | manuel | ⚠️ |
| `invokeai` | PyPI | pipx | ⬜ |
| `fooocus` | GH `lllyasviel/Fooocus` | manuel | ⚠️ |

### 24.18 Vector DBs / RAG (extensions §22.12 / §23.12)

| ID | Source | Install | Statut |
|---|---|---|---|
| `milvus` (`milvus_cli`) | GH `milvus-io/milvus` | binaire | ⬜ |
| `chroma` | PyPI | pipx | ⬜ |
| `pgvector` | GH `pgvector/pgvector` | extension PG | ⬜ |
| `vespa-cli` | ✓ §24.16 |

### 24.19 3D / CAD / impression 3D

| ID | Source | Install | Statut |
|---|---|---|---|
| `octoprint` | PyPI | pipx | ⬜ |
| `prusaslicer` / `cura` / `freecad` / `meshlab` | winget | ➡️ |
| `blender` | winget | ➡️ |

### 24.20 Audio / vidéo (CLIs)

| ID | Source | Install | Statut |
|---|---|---|---|
| `yt-dlp` | GH `yt-dlp/yt-dlp` | binaire / pipx | ⬜ |
| `gallery-dl` | PyPI | pipx | ⬜ |
| `streamlink` | PyPI | pipx | ⬜ |
| `sox` | OS pkg | ➡️ |
| `mlt` | OS pkg | ➡️ |
| `kdenlive` / `shotcut` / `audacity` / `obs-studio` | winget | ➡️ |
| `ffmpeg` / `imagemagick` / `exiftool` / `mediainfo` | winget | ➡️ |

### 24.21 Diagrammes / visualisation

| ID | Source | Install | Statut |
|---|---|---|---|
| `mermaid-cli` (`mmdc`) | npm | ➡️ `npm-g` |
| `d2` | GH `terrastruct/d2` | binaire | ⬜ |
| `plantuml` | GH `plantuml/plantuml` | binaire (JRE) | ⬜ |
| `graphviz` (`dot`) | winget | ➡️ |
| `structurizr-cli` | GH `structurizr/cli` | binaire (JRE) | ⬜ |
| `excalidraw-cli` | npm | ➡️ `npm-g` |

### 24.22 LaTeX / TeX

| ID | Source | Install | Statut |
|---|---|---|---|
| `tlmgr` (TeX Live Manager) | TeX Live | bundled | ⬜ |
| `miktex-cli` (`mpm`) | miktex.org | bundled | ⬜ |
| `tectonic` | GH `tectonic-typesetting/tectonic` | binaire | ⬜ |
| `chktex` / `latexindent` | TeX Live | bundled | ➡️ |
| `pandoc` | ✓ §23.2 |

### 24.23 Jupyter / notebooks

| ID | Source | Install | Statut |
|---|---|---|---|
| `jupyter` / `jupyterlab` | PyPI | pipx | ⬜ |
| `voila` | PyPI | pipx | ⬜ |
| `nbconvert` | PyPI | pipx | ⬜ |
| `nbqa` | PyPI | pipx | ⬜ |
| `papermill` | PyPI | pipx | ⬜ |
| `jupytext` | PyPI | pipx | ⬜ |
| `marimo` | PyPI | pipx | ⬜ |

### 24.24 Scientifique / statistique (CLIs)

| ID | Source | Install | Statut |
|---|---|---|---|
| `octave` / `gnuplot` / `scilab` / `maxima` | winget | ➡️ |
| `sage` (SageMath) | sagemath.org | manuel | ⚠️ |
| `gap` / `singular` / `pari` | binaire | ⚠️ |
| `root` (CERN) | GH `root-project/root` | binaire | ⚠️ |

### 24.25 Géographique / SIG

| ID | Source | Install | Statut |
|---|---|---|---|
| `gdal` (`ogr2ogr`) | winget | ➡️ |
| `proj` | OSGeo | ➡️ |
| `qgis` | winget | ➡️ |
| `tippecanoe` | GH `felt/tippecanoe` | binaire (WSL) | ⬜ |
| `osmium` | GH `osmcode/osmium-tool` | binaire (WSL) | ⬜ |
| `osm2pgsql` | GH `openstreetmap/osm2pgsql` | binaire (WSL) | ⬜ |

### 24.26 Quantum computing / scientific frameworks

| ID | Source | Install | Statut |
|---|---|---|---|
| `qiskit` | PyPI | pipx | ⬜ |
| `cirq` | PyPI | pipx | ⬜ |
| `pennylane` | PyPI | pipx | ⬜ |
| `braket-sdk` (AWS) | PyPI | pipx | ⬜ |
| `qsharp-cli` | crates.io / dotnet-tools | ➡️ `dotnet-tools` |

### 24.27 Productivité / tâches / temps (CLI)

| ID | Source | Install | Statut |
|---|---|---|---|
| `taskwarrior` | OS pkg | ➡️ |
| `timewarrior` | OS pkg | ➡️ |
| `vit` (taskwarrior TUI) | PyPI | pipx | ⬜ |
| `dstask` | GH `naggie/dstask` | binaire | ⬜ |
| `todoist-cli` | GH `sachaos/todoist` | binaire | ⬜ |
| `ticktick-cli` | npm | ➡️ `npm-g` |
| `khal` / `vdirsyncer` | PyPI | pipx | ⬜ |
| `gcalcli` | PyPI | pipx | ⬜ |

### 24.28 Templating / configuration runtime

| ID | Source | Install | Statut |
|---|---|---|---|
| `gomplate` | GH `hairyhenderson/gomplate` | binaire | ⬜ |
| `jinja2-cli` | PyPI | pipx | ⬜ |
| `esh` | GH `jirutka/esh` | binaire (WSL) | ⬜ |
| `envsubst` (gettext) | OS pkg | ➡️ |
| `shdotenv` | GH `ko1nksm/shdotenv` | binaire | ⬜ |
| `dotenv-cli` | npm | ➡️ `npm-g` |
| `chezmoi` | GH `twpayne/chezmoi` | binaire | ⬜ |
| `yadm` | GH `TheLocehiliosan/yadm` | binaire | ⬜ |

### 24.29 Recording / screencasts

| ID | Source | Install | Statut |
|---|---|---|---|
| `asciinema` | PyPI | pipx | ⬜ |
| `terminalizer` | npm | ➡️ `npm-g` |
| `vhs` | ✓ §24.4 |
| `ttyrec` / `ttygif` | OS pkg | ➡️ |
| `agg` (asciinema → gif) | GH `asciinema/agg` | binaire | ⬜ |

### 24.30 TUI lecteurs / clients

| ID | Source | Install | Statut |
|---|---|---|---|
| `newsboat` | GH `newsboat/newsboat` | binaire (WSL) | ⬜ |
| `newsraft` | newsraft.org | binaire (WSL) | ⬜ |
| `aerc` | GH `~rjarry/aerc` | binaire (WSL) | ⬜ |
| `neomutt` | GH `neomutt/neomutt` | binaire (WSL) | ⬜ |
| `lynx` / `w3m` / `elinks` | winget / apt | ➡️ |
| `browsh` | GH `browsh-org/browsh` | binaire | ⬜ |
| `carbonyl` | GH `fathyb/carbonyl` | binaire | ⬜ |
| `weechat` / `irssi` | apt | ➡️ |
| `gomuks` (Matrix TUI) | GH `tulir/gomuks` | binaire | ⬜ |
| `matrix-commander` | PyPI | pipx | ⬜ |

### 24.31 Cloud / hosting (additions)

| ID | Source | Install | Statut |
|---|---|---|---|
| `tccli` (Tencent) | GH `TencentCloud/tencentcloud-cli` | pipx | ⬜ |
| `jdcloud-cli` | GH `jdcloud-api/jdcloud-cli` | pipx | ⬜ |
| `huaweicloud-cli` | huaweicloud.com | binaire | ⬜ |
| `ovh-cli` | GH `ovh/ovh-cli` | binaire | ⬜ |
| `gandi-cli` | GH `Gandi/gandi.cli` | pipx | ⬜ |
| `equinix-metal` | GH `equinix/metal-cli` | binaire | ⬜ |
| `mc` (MinIO client) | GH `minio/mc` | binaire | ⬜ |
| `snowsql` | snowflake.com | binaire | ⬜ |
| `databricks-cli` | PyPI | pipx | ⬜ |
| `bigquery` (`bq`) | bundled `gcloud` | ➡️ `gcloud` |
| `gsutil` | bundled `gcloud` | ➡️ `gcloud` |
| `aws-session-manager-plugin` | AWS | binaire | ⬜ |

### 24.32 CI / CD platform clients

| ID | Source | Install | Statut |
|---|---|---|---|
| `circleci-cli` | GH `CircleCI-Public/circleci-cli` | binaire | ⬜ |
| `buildkite-agent` | GH `buildkite/agent` | binaire | ⬜ |
| `drone-cli` | GH `harness/drone-cli` | binaire | ⬜ |
| `woodpecker-cli` | GH `woodpecker-ci/woodpecker` | binaire | ⬜ |
| `jenkins-cli` | jenkins.io | JAR | ⬜ |
| `octopus-cli` | GH `OctopusDeploy/cli` | binaire | ⬜ |
| `harness-cli` | GH `harness/harness-cli` | binaire | ⬜ |
| `semaphore-cli` | GH `semaphoreci/cli` | binaire | ⬜ |
| `concourse-fly` | GH `concourse/concourse` | binaire | ⬜ |

### 24.33 SIEM / logs / agents (défensif)

| ID | Source | Install | Statut |
|---|---|---|---|
| `vector` (Datadog) | GH `vectordotdev/vector` | binaire | ⬜ |
| `fluent-bit` | GH `fluent/fluent-bit` | binaire | ⬜ |
| `fluentd` | RubyGems | gem | ⬜ |
| `promtail` | GH `grafana/loki` | binaire | ⬜ |
| `elastic-agent` | elastic.co | binaire | ⬜ |
| `filebeat` / `metricbeat` / `heartbeat` / `auditbeat` / `winlogbeat` | elastic.co | binaire | ⬜ |
| `grafana-alloy` | GH `grafana/alloy` | binaire | ⬜ |

### 24.34 Network analysis (défensif)

| ID | Source | Install | Statut |
|---|---|---|---|
| `nmap` | winget | ➡️ |
| `zmap` | GH `zmap/zmap` | binaire (WSL) | ⬜ |
| `arp-scan` | apt | ➡️ |
| `mtr` / `iperf3` | winget / apt | ➡️ |
| `dnscontrol` | GH `StackExchange/dnscontrol` | binaire | ⬜ |
| `octodns` | PyPI | pipx | ⬜ |
| `wireguard-tools` | wireguard.com | binaire | ⬜ |

### 24.35 Hardware monitoring

| ID | Source | Install | Statut |
|---|---|---|---|
| `smartmontools` (`smartctl`) | winget | ➡️ |
| `ipmitool` | apt | ➡️ |
| `redfishtool` | GH `DMTF/Redfishtool` | pipx | ⬜ |
| `lm-sensors` | apt | ➡️ |

### 24.36 Crypto wallets / hardware (legit dev)

| ID | Source | Install | Statut |
|---|---|---|---|
| `ledger-live-cli` | GH `LedgerHQ/ledger-live` | npm | ➡️ `npm-g` |
| `trezor-cli` (`trezorctl`) | PyPI | pipx | ⬜ |

### 24.37 Localization / i18n

| ID | Source | Install | Statut |
|---|---|---|---|
| `crowdin-cli` | GH `crowdin/crowdin-cli` | binaire (JRE) | ⬜ |
| `transifex-cli` | GH `transifex/cli` | binaire | ⬜ |
| `weblate-cli` | PyPI | pipx | ⬜ |
| `lokalise-cli2` | GH `lokalise/lokalise-cli-2-go` | binaire | ⬜ |
| `phraseapp-cli` | GH `phrase/phrase-cli` | binaire | ⬜ |
| `i18next-cli` | npm | ➡️ `npm-g` |

### 24.38 Writing / éditorial / accessibilité

| ID | Source | Install | Statut |
|---|---|---|---|
| `write-good` | npm | ➡️ `npm-g` |
| `alex` | npm | ➡️ `npm-g` |
| `mdslides` | PyPI | pipx | ⬜ |
| `axe-core-cli` | npm | ➡️ `npm-g` |
| `pa11y` | npm | ➡️ `npm-g` |
| `lighthouse` | npm | ➡️ `npm-g` |
| `sitespeed.io` | npm | ➡️ `npm-g` |

### 24.39 SSO / auth helpers (additions)

| ID | Source | Install | Statut |
|---|---|---|---|
| `saml2aws` | GH `Versent/saml2aws` | binaire | ⬜ |
| `aws-google-auth` | PyPI | pipx | ⬜ |
| `aws-okta` | GH `segmentio/aws-okta` | binaire | ⬜ |
| `aws-azure-login` | npm | ➡️ `npm-g` |
| `gimme-aws-creds` | PyPI | pipx | ⬜ |
| `aws-export-credentials` | PyPI | pipx | ⬜ |

### 24.40 Niche scientific languages / DSLs

| ID | Source | Install | Statut |
|---|---|---|---|
| `mojo` | modular.com | installer | ⚠️ pre-release |
| `bend` | GH `HigherOrderCO/Bend` | binaire | ⚠️ pre-1.0 |
| `janet` | GH `janet-lang/janet` | binaire | ⬜ |
| `fennel` | luarocks | ➡️ `luarocks` |
| `hy` | PyPI | pipx | ⬜ |
| `babashka` (`bb`) | GH `babashka/babashka` | binaire | ⬜ |
| `clj-kondo` | GH `clj-kondo/clj-kondo` | binaire | ⬜ |
| `leiningen` (`lein`) | leiningen.org | binaire (JRE) | ⬜ |
| `scala-cli` | GH `VirtusLab/scala-cli` | binaire | ⬜ |
| `mill` | GH `com-lihaoyi/mill` | binaire (JRE) | ⬜ |
| `alire` (Ada) | GH `alire-project/alire` | binaire | ⬜ |
| `cpanm` (Perl) | App::cpanminus | cpan | ⬜ |
| `zef` (Raku) | GH `ugexe/zef` | binaire | ⬜ |
| `rebar3` (Erlang) | GH `erlang/rebar3` | binaire | ⬜ |
| `shards` (Crystal) | GH `crystal-lang/shards` | binaire | ⬜ |
| `dub` (D) | GH `dlang/dub` | binaire | ⬜ |

### 24.41 API mock / proxy (dev)

| ID | Source | Install | Statut |
|---|---|---|---|
| `mailpit` | GH `axllent/mailpit` | binaire | ⬜ |
| `mailhog` | GH `mailhog/MailHog` | binaire | ⚠️ archivé |
| `smtp4dev` | GH `rnwood/smtp4dev` | dotnet-tools | ⬜ |
| `mailcatcher` | RubyGems | gem | ⬜ |
| `mockoon-cli` | npm | ➡️ `npm-g` |
| `prism` (Stoplight) | npm | ➡️ `npm-g` |
| `wiremock` | GH `wiremock/wiremock` | JAR | ⬜ |
| `mitmproxy` | PyPI | pipx | ⚠️ (audit only) |

### 24.42 Web performance / audit

| ID | Source | Install | Statut |
|---|---|---|---|
| `lighthouse` | ✓ §24.38 |
| `pagespeed-insights` | npm | ➡️ `npm-g` |
| `webpagetest-cli` | npm | ➡️ `npm-g` |
| `sitespeed.io` | ✓ §24.38 |
| `unlighthouse` | npm | ➡️ `npm-g` |

### 24.43 Browser drivers (Selenium)

| ID | Source | Install | Statut |
|---|---|---|---|
| `chromedriver` | chromium.org | binaire | ⬜ |
| `geckodriver` | GH `mozilla/geckodriver` | binaire | ⬜ |
| `edgedriver` | microsoft.com | binaire | ⬜ |
| `selenium-manager` | bundled selenium | ➡️ |
| `webdriver-manager` | npm | ➡️ `npm-g` |

### 24.44 Profilers / tracing

| ID | Source | Install | Statut |
|---|---|---|---|
| `py-spy` | PyPI | pipx | ⬜ |
| `austin` | GH `P403n1x87/austin` | binaire | ⬜ |
| `scalene` | PyPI | pipx | ⬜ |
| `speedscope` | npm | ➡️ `npm-g` |
| `flamegraph` | GH `brendangregg/FlameGraph` | binaire (Perl) | ⬜ |
| `cargo-flamegraph` | crates.io | cargo | ➡️ `cargo` |
| `async-profiler` | GH `async-profiler/async-profiler` | binaire (JVM) | ⬜ |
| `pprof` | GH `google/pprof` | binaire (Go) | ⬜ |

### 24.45 Static site / blog (additional)

| ID | Source | Install | Statut |
|---|---|---|---|
| `eleventy` (`@11ty/eleventy`) | npm | ➡️ `npm-g` |
| `astro` | npm | ➡️ `npm-g` |
| `nextra` | npm | ➡️ `npm-g` |
| `pelican` | PyPI | pipx | ⬜ |
| `nikola` | PyPI | pipx | ⬜ |
| `middleman` | RubyGems | gem | ⬜ |
| `bridgetown` | RubyGems | gem | ⬜ |

### 24.46 Hardware / industriel

| ID | Source | Install | Statut |
|---|---|---|---|
| `mqtt-cli` | ✓ §24.15 |
| `node-red` | npm | ➡️ `npm-g` |
| `homeassistant-cli` (`hass-cli`) | PyPI | pipx | ⬜ |
| `thingsboard-cli` | thingsboard.io | binaire (JRE) | ⚠️ |
| `opcua-client` | PyPI | pipx | ⚠️ niche |

### 24.47 Workflow / task runners (additions)

| ID | Source | Install | Statut |
|---|---|---|---|
| `n8n` | npm | ➡️ `npm-g` |
| `temporal-cli` | ✓ §23.6 |
| `cadence-cli` | GH `uber/cadence` | binaire | ⬜ |
| `windmill` | GH `windmill-labs/windmill` | binaire | ⬜ |
| `argo-events` | argoproj | binaire | ⬜ |

### 24.48 Self-hosted services / dev infra (additions §23.13)

| ID | Source | Install | Statut |
|---|---|---|---|
| `gitea` | GH `go-gitea/gitea` | binaire | ⬜ |
| `forgejo` | codeberg.org `forgejo/forgejo` | binaire | ⬜ |
| `gitlab-runner` | gitlab.com | binaire | ⬜ |
| `keycloak` | ✓ §23.8 |
| `minio` (server) | GH `minio/minio` | binaire | ⬜ |
| `seaweedfs` | GH `seaweedfs/seaweedfs` | binaire | ⬜ |
| `garage` | git.deuxfleurs.fr | binaire | ⬜ |
| `meilisearch` | ✓ §23.12 |
| `plausible` | GH `plausible/community-edition` | docker | ⚠️ docker-only |
| `umami` | GH `umami-software/umami` | docker / npm | ⚠️ |

### 24.49 Config-as-code (additions §23.11)

Toutes les entrées de §23.11 (`cue`, `jsonnet`, `dhall`, `nickel`, `pkl`) restent valides. Pas d'ajout.

### 24.50 Modern dev utils (additions §22.12)

Compléments aux outils déjà winget/scoop. Provider dédié seulement si tracking GH spécifique souhaité :

`bat`, `eza`, `fd`, `ripgrep`, `fzf`, `zoxide`, `hyperfine`, `tokei`, `jq`, `yq`, `xh`, `gum`, `glow`, `direnv`, `watchexec`, `dust`, `duf`, `procs`, `bottom`, `zellij`, `helix`, `broot`, `atuin`, `pueue`, `mcfly`, `carapace`, `ouch`, `sd`, `choose`, `entr`, `mob`, `lefthook`, `chezmoi`, `yadm`, `direnv`, `delta`, `viu`, `chafa`, `nb`, `tldr` (`tealdeer`), `cheat`, `navi`, `eg`, `bashtop`, `up`, `peco`, `kotlin-native`, `cargo-watch`, `nvm` (wsl).

---

## 25. Ordre de priorité d'implémentation

1. **`gh-releases` meta-provider (§21)** — débloque ~70 % des candidats ci-dessous sous forme de config TOML.
2. **Sécurité** : `gitleaks`, `trufflehog`, `osv-scanner`, `checkov`, `conftest`, `opa`, `infracost`.
3. **Kubernetes ops** : `k9s`, `stern`, `kubectx`, `kubeseal`, `velero`, `istioctl`, `eksctl`.
4. **Secrets / PKI** : `sops`, `age`, `step`, `mkcert`.
5. **Migrations DB** : `atlas`, `golang-migrate`, `dbmate`.
6. **Containers** : `skopeo`, `crane`, `ko`, `earthly`, `dagger`.
7. **Cloud gaps** : `ibmcloud`, `yc`, `aliyun`, `civo`.
8. **LLM** : `ollama`, `huggingface-cli`, `aider`.
9. **Langages** : `ghcup`, `foundry`, `solana`, `tauri-cli`.
10. **Tunneling / web** : `cloudflared`, `tailscale`, `caddy`.
