# Providers catalog

Unified overview — implementation status, sources, and out-of-scope items. Source: `src/core/registry.ts` (`ALL_PROVIDERS`, 134 entries). Snapshot: 2026-08-05.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Integrated (registered in `ALL_PROVIDERS`) |
| 🚧 | Code present in `src/providers/`, not wired (outputs `manual: true`, filtered by `scanAll`) |
| ⬜ | Candidate — no code yet |
| ➡️ | Absorbed — covered by an existing provider |
| ❌ | Out of scope |

**Global out-of-scope**: the OS itself — Windows (Windows Update, WSUS, `PSWindowsUpdate`, OEM drivers, SYSTEM services, DISM, provisioned Appx, M365 Click-to-Run) and macOS (`softwareupdate`, XProtect/MRT, Command Line Tools, Apple's SIP-frozen system Ruby) — plus anything project-scoped (Maven, Gradle, sbt, bundler, `npm ci`, `pip-tools sync`, lockfiles).

---

## 1. OS / Windows

| ID | Source | Status |
|---|---|---|
| `winget` | Windows Package Manager | ✅ |
| `scoop` | Scoop | ✅ |
| `choco` | Chocolatey | ✅ |

## 1b. OS / macOS

| ID | Source | Status |
|---|---|---|
| `brew` | Homebrew formulae (`brew outdated --formula`) | ✅ |
| `brew-cask` | Homebrew casks (GUI apps, `/Applications`) | ✅ |
| `mas` | Mac App Store, via the `mas` CLI | ✅ |
| `macports` | MacPorts (`port outdated`, upgrades via `sudo`) | ✅ |
| `softwareupdate` | macOS releases / XProtect / CLT | ❌ out of scope (OS-level) |

`brew` also covers **Linuxbrew**, so it is not gated on darwin. `brew-cask`,
`mas` and `macports` are macOS-only and report themselves unavailable elsewhere.

Native Linux distro packages are not standalone providers: `apt` and `dnf` are
reachable as **delegation targets** (`InstallSource`), so a tool installed by
the distro is upgraded through `sudo apt-get install --only-upgrade` /
`sudo dnf upgrade` rather than being reported as manual.

## 2. WSL

| ID | Target | Status |
|---|---|---|
| `wsl` | WSL kernel (host) | ✅ |
| `wsl-apt` | apt (Debian/Ubuntu) | ✅ |
| `wsl-dnf` | dnf (Fedora) | ✅ |
| `wsl-pacman` | pacman (Arch) | ✅ |
| `wsl-brew` | Linuxbrew | ✅ |
| `wsl-flatpak` | Flatpak | ✅ |
| `wsl-nix` | Nix | ✅ |

## 3. Node.js / JavaScript

| ID | Source | Status |
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

| ID | Source | Status |
|---|---|---|
| `pip` | pip (user) | ✅ |
| `pipx` | pipx | ✅ |
| `uv-tools` | uv tools | ✅ |
| `poetry` | Poetry self-update | ✅ |
| `pdm` | PDM self-update | ✅ |
| `rye` | Rye self-update | ✅ |
| `pyenv-win` | pyenv-win | ✅ |
| `conda` | Conda (base env) | ✅ |

## 5. Ruby / .NET / PHP

| ID | Source | Status |
|---|---|---|
| `gem` | RubyGems | ✅ |
| `dotnet-tools` | .NET global tools | ✅ |
| `composer-self` | Composer (binary) | ✅ |
| `composer-g` | Composer global | ✅ |
| `symfony-cli` | Symfony CLI | ✅ |
| `phive` | PHIVE | ✅ |

## 6. JVM

| ID | Source | Status |
|---|---|---|
| `jbang` | JBang | ✅ |
| `coursier-cs` | Coursier (Scala) | ✅ |
| `sdkman` | SDKMAN! (WSL) | ✅ |

## 7. Other languages

| ID | Source | Status |
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

| ID | Source | Status |
|---|---|---|
| `rustup` | rustup toolchains | ✅ |
| `cargo` | cargo-update | ✅ |
| `pwsh-modules` | PSGallery (CurrentUser) | ✅ |

## 9. Polyglot toolchain

| ID | Source | Status |
|---|---|---|
| `mise` | mise | ✅ |
| `asdf` | asdf-vm | ✅ |
| `proto` | proto (moonrepo) | ✅ |
| `goenv` | goenv | ✅ |

## 10. Cloud CLIs

| ID | Source | Status |
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

| ID | Source | Status |
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
| `tfsec` | TFSec | ❌ deprecated → `trivy` |
| `cdktf` / `cdk8s` / `aws-cdk` | CDKs | ➡️ `npm-g` |

## 12. Kubernetes / Helm

| ID | Source | Status |
|---|---|---|
| `helm` | Helm | ✅ |
| `helm-repo` | Helm repos | ✅ |
| `helm-plugins` | Helm plugins | ✅ |
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

| ID | Source | Status |
|---|---|---|
| `nerdctl` | nerdctl (containerd) | ✅ |
| `oras` | ORAS | ✅ |
| `dive` | dive | ✅ |
| `docker-images` | Pinned Docker tags | ❌ removed — local images are workload artifacts, not tools to update |
| `docker-desktop` | Docker Desktop | ✅ scan-only |
| `podman-desktop` | Podman Desktop | ✅ scan-only |
| `rancher-desktop` | Rancher Desktop | ✅ scan-only |

## 14. Security / scanning

| ID | Source | Status |
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

| ID | Source | Status |
|---|---|---|
| `lazygit` | Lazygit | ✅ |
| `lazydocker` | Lazydocker | ✅ |
| `jj` | Jujutsu VCS | ✅ |
| `delta` | git-delta | ✅ |
| `glab` | GitLab CLI | ✅ |
| `tea` | Gitea CLI | ✅ |
| `gh-ext` | GitHub CLI extensions | ✅ |

## 16. Embedded / Mobile

| ID | Source | Status |
|---|---|---|
| `arduino-cli` | Arduino CLI | ✅ |
| `platformio` | PlatformIO Core | ✅ |
| `android-sdk` | Android SDK Manager | ✅ |
| `expo` | Expo CLI | ✅ |
| `fastlane` | Fastlane | ✅ |

## 17. Shell / cosmetic

| ID | Source | Status |
|---|---|---|
| `oh-my-posh` | Oh My Posh | ✅ |
| `starship` | Starship prompt | ✅ |
| `nerd-fonts` | Nerd Fonts (per-user) | ✅ |

## 18. Editors / IDEs & extensions

| ID | Source | Status |
|---|---|---|
| `vscode-ext` | VS Code Marketplace | ✅ |
| `cursor-ext` | Cursor | ✅ |
| `windsurf-ext` | Windsurf | ✅ |
| `vscodium-ext` | VSCodium + Open VSX | ✅ |
| `jetbrains` | JetBrains IDEs (Toolbox + standalone) | ✅ |
| `jetbrains-plugins` | JetBrains plugins | 🚧 |
| `zed-ext` | Zed extensions | 🚧 |
| `sublime-pc` | Sublime Package Control | 🚧 |
| `obsidian-plugins` | Obsidian community plugins | 🚧 |
| `unity-hub` | Unity Editor versions | 🚧 |
| `notepad-pp` | Notepad++ plugins | 🚧 |
| `eclipse-marketplace` | Eclipse / p2 features | 🚧 |

## 19. Editor plugins (headless)

| ID | Source | Status |
|---|---|---|
| `nvim-lazy` | lazy.nvim | ✅ |
| `nvim-packer` | packer.nvim | ✅ |
| `nvim-mason` | mason.nvim | ✅ |
| `vim-plug` | vim-plug | ✅ |

## 20. PM self-update (`self:*`)

| Target | Latest source | Update | Status |
|---|---|---|---|
| `self:winget` | GitHub `microsoft/winget-cli` | detection-only | ✅ |
| `self:scoop` | GitHub `ScoopInstaller/Scoop` | `scoop update` | ✅ |
| `self:choco` | GitHub `chocolatey/choco` | `choco upgrade chocolatey -y` (admin) | ✅ |
| `self:npm` | npm registry | `npm install -g npm@latest` | ✅ |
| `self:pnpm` | npm registry | `pnpm add -g pnpm` | ✅ |
| `self:yarn` | npm registry | `corepack prepare yarn@stable --activate` | ✅ |
| `self:pip` | PyPI | `python -m pip install --user -U pip` | ✅ |
| `self:pipx` | PyPI | `pipx upgrade pipx` | ✅ |
| `self:gh` | GitHub `cli/cli` | delegated to install source | ✅ |
| `self:symfony-cli` | — | already covered by `SymfonyCliProvider` | ❌ |
| `self:rustup` | — | already covered by the `rustup` provider | ❌ |
| `self:jb-toolbox` | — | GUI auto-update, no CLI | ❌ |

## 21. Meta-provider

| ID | Source | Status |
|---|---|---|
| `gh-releases` | Config-driven (`gup.releases.toml`): `<owner>/<repo>` + asset pattern + local binary, GitHub API `releases/latest`, user-scope install (`%LOCALAPPDATA%\gup\bin`) | ⬜ |

---

## 22. Implementation candidates

Providers outside the OS scope and out of project-scoped territory, compatible with the existing infrastructure (`fetchGitHubReleaseLatest`, `hashicorp-releases.ts`, `pipx`, `npm-g`, `cargo`, `go install`).

### 22.1 Security / scanning

| ID | Latest source | Install | Status |
|---|---|---|---|
| `gitleaks` | GH `gitleaks/gitleaks` | binary | ⬜ |
| `trufflehog` | GH `trufflesecurity/trufflehog` | binary | ⬜ |
| `osv-scanner` | GH `google/osv-scanner` | binary | ⬜ |
| `checkov` | PyPI | pipx | ⬜ |
| `kics` | GH `Checkmarx/kics` | binary | ⬜ |
| `terrascan` | GH `tenable/terrascan` | binary | ⬜ |
| `conftest` | GH `open-policy-agent/conftest` | binary | ⬜ |
| `opa` | GH `open-policy-agent/opa` | binary | ⬜ |
| `infracost` | GH `infracost/infracost` | binary | ⬜ |
| `kube-bench` | GH `aquasecurity/kube-bench` | binary | ⬜ |
| `kubescape` | GH `kubescape/kubescape` | binary | ⬜ |
| `govulncheck` | `golang.org/x/vuln/cmd/govulncheck` | `go install` | ⬜ |
| `prowler` | PyPI | pipx | ⬜ |

### 22.2 Kubernetes / ecosystem

| ID | Latest source | Install | Status |
|---|---|---|---|
| `k9s` | GH `derailed/k9s` | binary | ⬜ |
| `stern` | GH `stern/stern` | binary | ⬜ |
| `kubectx` / `kubens` | GH `ahmetb/kubectx` | binary | ⬜ |
| `kubeseal` | GH `bitnami-labs/sealed-secrets` | binary | ⬜ |
| `velero` | GH `vmware-tanzu/velero` | binary | ⬜ |
| `cilium-cli` | GH `cilium/cilium-cli` | binary | ⬜ |
| `istioctl` | GH `istio/istio` | binary | ⬜ |
| `linkerd` | GH `linkerd/linkerd2` | binary | ⬜ |
| `argo` | GH `argoproj/argo-workflows` | binary | ⬜ |
| `tkn` | GH `tektoncd/cli` | binary | ⬜ |
| `eksctl` | GH `weaveworks/eksctl` | binary | ⬜ |
| `talosctl` | GH `siderolabs/talos` | binary | ⬜ |
| `kops` | GH `kubernetes/kops` | binary | ⬜ |
| `crossplane` | GH `crossplane/crossplane` | binary | ⬜ |
| `kyverno` | GH `kyverno/kyverno` | binary | ⬜ |

### 22.3 Containers / OCI

| ID | Latest source | Install | Status |
|---|---|---|---|
| `podman` | GH `containers/podman` | binary | ⬜ |
| `buildah` | GH `containers/buildah` | binary (WSL) | ⬜ |
| `skopeo` | GH `containers/skopeo` | binary | ⬜ |
| `crane` | GH `google/go-containerregistry` | binary | ⬜ |
| `regctl` | GH `regclient/regclient` | binary | ⬜ |
| `ko` | GH `ko-build/ko` | binary | ⬜ |
| `earthly` | GH `earthly/earthly` | binary | ⬜ |
| `dagger` | GH `dagger/dagger` | binary | ⬜ |

### 22.4 Migrations / SQL CLIs

| ID | Latest source | Install | Status |
|---|---|---|---|
| `atlas` | GH `ariga/atlas` | binary | ⬜ |
| `dbmate` | GH `amacneil/dbmate` | binary | ⬜ |
| `goose` | GH `pressly/goose` | binary | ⬜ |
| `golang-migrate` | GH `golang-migrate/migrate` | binary | ⬜ |
| `flyway` | GH `flyway/flyway` | binary (JRE) | ⬜ |
| `pgcli` / `mycli` / `litecli` | PyPI | pipx | ⬜ |
| `usql` | GH `xo/usql` | binary | ⬜ |

### 22.5 Cloud CLIs (gaps)

| ID | Latest source | Install | Status |
|---|---|---|---|
| `ibmcloud` | IBM installer | binary | ⬜ |
| `yc` | GH `yandex-cloud/cli` | binary | ⬜ |
| `aliyun` | GH `aliyun/aliyun-cli` | binary | ⬜ |
| `vultr-cli` | GH `vultr/vultr-cli` | binary | ⬜ |
| `civo` | GH `civo/cli` | binary | ⬜ |
| `exoscale-cli` | GH `exoscale/cli` | binary | ⬜ |
| `pscale` | GH `planetscale/cli` | binary | ⬜ |
| `turso` | GH `tursodatabase/turso-cli` | binary | ⬜ |
| `neonctl` | npm | ➡️ `npm-g` | absorbed |

### 22.6 Secrets / crypto / certs

| ID | Latest source | Install | Status |
|---|---|---|---|
| `sops` | GH `getsops/sops` | binary | ⬜ |
| `age` | GH `FiloSottile/age` | binary | ⬜ |
| `step` | GH `smallstep/cli` | binary | ⬜ |
| `step-ca` | GH `smallstep/certificates` | binary | ⬜ |
| `mkcert` | GH `FiloSottile/mkcert` | binary | ⬜ |
| `cfssl` | GH `cloudflare/cfssl` | binary | ⬜ |
| `bw` | GH `bitwarden/clients` | binary | ⬜ |
| `op` | 1Password installer | binary | ⬜ |
| `gopass` | GH `gopasspw/gopass` | binary | ⬜ |

### 22.7 Network / tunneling / web

| ID | Latest source | Install | Status |
|---|---|---|---|
| `cloudflared` | GH `cloudflare/cloudflared` | binary | ⬜ |
| `ngrok` | ngrok installer | binary | ⬜ |
| `tailscale` | tailscale installer | binary | ⬜ |
| `caddy` | GH `caddyserver/caddy` | binary | ⬜ |
| `traefik` | GH `traefik/traefik` | binary | ⬜ |

### 22.8 Build / task runners / local CI

| ID | Latest source | Install | Status |
|---|---|---|---|
| `bazelisk` | GH `bazelbuild/bazelisk` | binary | ⬜ |
| `act` | GH `nektos/act` | binary | ⬜ |
| `just` | GH `casey/just` | binary | ⬜ |
| `task` | GH `go-task/task` | binary | ⬜ |
| `mage` | GH `magefile/mage` | binary | ⬜ |
| `pre-commit` | PyPI | pipx | ⬜ |
| `lefthook` | GH `evilmartians/lefthook` | binary | ⬜ |

### 22.9 Observability

| ID | Latest source | Install | Status |
|---|---|---|---|
| `promtool` | GH `prometheus/prometheus` | binary | ⬜ |
| `amtool` | GH `prometheus/alertmanager` | binary | ⬜ |
| `otelcol` | GH `open-telemetry/opentelemetry-collector-releases` | binary | ⬜ |
| `mimirtool` | GH `grafana/mimir` | binary | ⬜ |
| `thanos` | GH `thanos-io/thanos` | binary | ⬜ |
| `vmctl` | GH `VictoriaMetrics/VictoriaMetrics` | binary | ⬜ |

### 22.10 AI / LLM tooling

| ID | Latest source | Install | Status |
|---|---|---|---|
| `ollama` | GH `ollama/ollama` | installer + binary | ⬜ |
| `huggingface-cli` | PyPI | pipx | ⬜ |
| `aider` | PyPI | pipx | ⬜ |
| `@anthropic-ai/claude-code` | npm | ➡️ `npm-g` | absorbed |
| `@google/gemini-cli` | npm | ➡️ `npm-g` | absorbed |
| `replicate` | npm | ➡️ `npm-g` | absorbed |

### 22.11 Language toolchains

| ID | Latest source | Install | Status |
|---|---|---|---|
| `ghcup` | GH `haskell/ghcup-hs` | binary | ⬜ |
| `zvm` | GH `tristanisham/zvm` | binary | ⬜ |
| `solana` | GH `anza-xyz/agave` | binary | ⬜ |
| `foundry` (`forge`/`cast`/`anvil`/`chisel`) | GH `foundry-rs/foundry` | foundryup | ⬜ |
| `tauri-cli` | crates.io | cargo | ⬜ |
| `crystal-shards` | bundled Crystal | OS pkg | ⬜ |
| `dub` | bundled D | OS pkg | ⬜ |

### 22.12 Dev UX / file utilities

`bat`, `eza`, `fd`, `ripgrep`, `fzf`, `zoxide`, `hyperfine`, `tokei`, `jq`, `yq`, `xh`, `gum`, `glow`, `direnv`, `watchexec`, `dust`, `duf`, `procs`, `bottom`, `zellij`, `helix`, `broot`, `atuin`, `pueue` → ➡️ absorbed by `winget` / `scoop` for most installs. A dedicated provider only makes sense when specific GitHub tracking is required.

---

## 23. Extended scope

Additional candidates beyond the core dev/ops kernel. Indicative install sources, same legend (⬜ candidate · ➡️ absorbed · ⚠️ niche/marginal · ❌ intentionally out of scope).

### 23.1 Linters / formatters / cross-language quality

| ID | Source | Install | Status |
|---|---|---|---|
| `shellcheck` | GH `koalaman/shellcheck` | binary | ⬜ |
| `shfmt` | GH `mvdan/sh` | binary | ⬜ |
| `yamllint` | PyPI | pipx | ⬜ |
| `vale` | GH `errata-ai/vale` | binary | ⬜ |
| `proselint` | PyPI | pipx | ⬜ |
| `markdownlint-cli` | npm | ➡️ `npm-g` |
| `editorconfig-checker` | GH `editorconfig-checker/editorconfig-checker` | binary | ⬜ |
| `ruff` | PyPI | pipx | ⬜ |
| `mypy` | PyPI | pipx | ⬜ |
| `pyright` | npm | ➡️ `npm-g` |
| `biome` | npm | ➡️ `npm-g` |
| `oxlint` | npm | ➡️ `npm-g` |
| `ast-grep` (`sg`) | GH `ast-grep/ast-grep` | binary | ⬜ |
| `tree-sitter` | GH `tree-sitter/tree-sitter` | binary | ⬜ |
| `codeql` | GH `github/codeql-cli-binaries` | binary | ⬜ |
| `sonar-scanner` | sonarsource | binary | ⬜ |
| `reviewdog` | GH `reviewdog/reviewdog` | binary | ⬜ |
| `harper` | GH `Automattic/harper` | binary | ⬜ |

### 23.2 Documentation / SSG

| ID | Source | Install | Status |
|---|---|---|---|
| `pandoc` | GH `jgm/pandoc` | binary | ⬜ |
| `hugo` | GH `gohugoio/hugo` | binary | ⬜ |
| `zola` | GH `getzola/zola` | binary | ⬜ |
| `mdbook` | crates.io | cargo | ⬜ |
| `mkdocs` | PyPI | pipx | ⬜ |
| `sphinx` | PyPI | pipx | ⬜ |
| `asciidoctor` | RubyGems | gem | ⬜ |
| `jekyll` | RubyGems | gem | ⬜ |
| `docusaurus` / `vitepress` / `starlight` | npm | ➡️ `npm-g` |

### 23.3 Load testing / performance / benchmarks

| ID | Source | Install | Status |
|---|---|---|---|
| `k6` | GH `grafana/k6` | binary | ⬜ |
| `vegeta` | GH `tsenart/vegeta` | binary | ⬜ |
| `hey` | GH `rakyll/hey` | binary | ⬜ |
| `wrk` | GH `wg/wrk` | binary (WSL) | ⬜ |
| `locust` | PyPI | pipx | ⬜ |
| `artillery` | npm | ➡️ `npm-g` |
| `jmeter` | GH `apache/jmeter` | binary (JRE) | ⬜ |

### 23.4 API / protocols

| ID | Source | Install | Status |
|---|---|---|---|
| `grpcurl` | GH `fullstorydev/grpcurl` | binary | ⬜ |
| `evans` | GH `ktr0731/evans` | binary | ⬜ |
| `buf` | GH `bufbuild/buf` | binary | ⬜ |
| `protoc` | GH `protocolbuffers/protobuf` | binary | ⬜ |
| `protolint` | GH `yoheimuta/protolint` | binary | ⬜ |
| `openapi-generator` | GH `OpenAPITools/openapi-generator` | binary (JRE) | ⬜ |
| `spectral` | npm | ➡️ `npm-g` |
| `newman` | npm | ➡️ `npm-g` |
| `bruno` | GH `usebruno/bruno` | binary | ⬜ |
| `hurl` | GH `Orange-OpenSource/hurl` | binary | ⬜ |
| `pact-cli` | GH `pact-foundation/pact-ruby-standalone` | binary | ⬜ |

### 23.5 Backup / sync / filesystem

| ID | Source | Install | Status |
|---|---|---|---|
| `restic` | GH `restic/restic` | binary | ⬜ |
| `borg` | GH `borgbackup/borg` | binary (WSL) | ⬜ |
| `kopia` | GH `kopia/kopia` | binary | ⬜ |
| `rclone` | GH `rclone/rclone` | binary | ⬜ |
| `syncthing` | GH `syncthing/syncthing` | binary | ⬜ |
| `duplicacy` | GH `gilbertchen/duplicacy` | binary | ⚠️ commercial |
| `yazi` | GH `sxyazi/yazi` | binary | ⬜ |
| `xplr` | GH `sayanarijit/xplr` | binary | ⬜ |

### 23.6 Workflow / data orchestration / ETL

| ID | Source | Install | Status |
|---|---|---|---|
| `dbt-core` | PyPI | pipx | ⬜ |
| `dlt` | PyPI | pipx | ⬜ |
| `airflow` | PyPI | pipx | ⚠️ project-scoped |
| `prefect` | PyPI | pipx | ⚠️ project-scoped |
| `dagster` | PyPI | pipx | ⚠️ project-scoped |
| `meltano` | PyPI | pipx | ⬜ |
| `airbyte` | GH `airbytehq/airbyte` | binary | ⬜ |
| `temporal` | GH `temporalio/cli` | binary | ⬜ |
| `duckdb` | GH `duckdb/duckdb` | binary | ⬜ |

### 23.7 ML / MLOps

| ID | Source | Install | Status |
|---|---|---|---|
| `mlflow` | PyPI | pipx | ⬜ |
| `wandb` | PyPI | pipx | ⬜ |
| `dvc` | PyPI | pipx | ⬜ |
| `bentoml` | PyPI | pipx | ⬜ |
| `ray` | PyPI | pipx | ⬜ |
| `modal` | PyPI | pipx | ⬜ |
| `runpodctl` | GH `runpod/runpodctl` | binary | ⬜ |
| `replicate` | npm | ➡️ `npm-g` |
| `vast-ai` | PyPI | pipx | ⚠️ niche |

### 23.8 Identity / IAM

| ID | Source | Install | Status |
|---|---|---|---|
| `keycloak` (kcadm) | GH `keycloak/keycloak` | binary (JRE) | ⬜ |
| `ory` | GH `ory/cli` | binary | ⬜ |
| `zitadel` | GH `zitadel/zitadel` | binary | ⬜ |
| `authelia` | GH `authelia/authelia` | binary | ⬜ |
| `aws-vault` | GH `99designs/aws-vault` | binary | ⬜ |
| `gimme-aws-creds` | PyPI | pipx | ⬜ |
| `okta-cli` | GH `okta/okta-cli` | binary (JRE) | ⬜ |

### 23.9 Web3 / blockchain

| ID | Source | Install | Status |
|---|---|---|---|
| `foundry` | GH `foundry-rs/foundry` | foundryup | ⬜ (see §22.11) |
| `hardhat` | npm | ➡️ `npm-g` |
| `truffle` | npm | ➡️ `npm-g` |
| `solana` | GH `anza-xyz/agave` | binary | ⬜ (see §22.11) |
| `anchor` | npm | ➡️ `npm-g` |
| `aptos` | GH `aptos-labs/aptos-core` | binary | ⬜ |
| `sui` | GH `MystenLabs/sui` | binary | ⬜ |
| `starkli` | GH `xJonathanLEI/starkli` | binary | ⬜ |
| `cosmos` (`gaiad`, `simd`) | GH `cosmos/cosmos-sdk` | binary | ⚠️ niche |
| `bitcoin-cli` | GH `bitcoin/bitcoin` | binary | ⚠️ niche |
| `nostr-tools` | npm | ➡️ `npm-g` |

### 23.10 Hardware / embedded / IoT

| ID | Source | Install | Status |
|---|---|---|---|
| `esptool` | PyPI | pipx | ⬜ |
| `west` (Zephyr) | PyPI | pipx | ⬜ |
| `probe-rs` | crates.io | cargo | ⬜ |
| `openocd` | GH `openocd-org/openocd` | binary | ⬜ |
| `nrfutil` | nordicsemi | binary | ⚠️ niche |
| `balena` | GH `balena-io/balena-cli` | binary | ⬜ |
| `particle` | npm | ➡️ `npm-g` |
| `ros2` | OS pkg | apt/winget | ⚠️ niche |

### 23.11 Config-as-code

| ID | Source | Install | Status |
|---|---|---|---|
| `cue` | GH `cue-lang/cue` | binary | ⬜ |
| `jsonnet` (`go-jsonnet`) | GH `google/go-jsonnet` | binary | ⬜ |
| `dhall` | GH `dhall-lang/dhall-haskell` | binary | ⬜ |
| `nickel` | GH `tweag/nickel` | binary | ⬜ |
| `pkl` | GH `apple/pkl` | binary | ⬜ |

### 23.12 Vector DBs / search engines (clients)

| ID | Source | Install | Status |
|---|---|---|---|
| `meilisearch` | GH `meilisearch/meilisearch` | binary | ⬜ |
| `typesense` | GH `typesense/typesense` | binary | ⬜ |
| `qdrant` | GH `qdrant/qdrant` | binary | ⬜ |
| `weaviate` | GH `weaviate/weaviate` | binary | ⬜ |
| `algolia` (`@algolia/cli`) | npm | ➡️ `npm-g` |

### 23.13 PaaS / self-hosted dev infra

| ID | Source | Install | Status |
|---|---|---|---|
| `coolify-cli` | npm | ➡️ `npm-g` |
| `caprover` | npm | ➡️ `npm-g` |
| `dokku` | GH `dokku/dokku` | binary (WSL) | ⬜ |
| `okteto` | GH `okteto/okteto` | binary | ⬜ |
| `devspace` | GH `devspace-sh/devspace` | binary | ⬜ |
| `garden` | GH `garden-io/garden` | binary | ⬜ |
| `nitric` | GH `nitrictech/cli` | binary | ⬜ |

### 23.14 Mobile / cross-platform testing

| ID | Source | Install | Status |
|---|---|---|---|
| `maestro` | GH `mobile-dev-inc/maestro` | binary | ⬜ |
| `appium` | npm | ➡️ `npm-g` |
| `detox` | npm | ➡️ `npm-g` |
| `patrol` | pub.dev | `pub-global` |
| `playwright` | npm | ➡️ `npm-g` |
| `cypress` | npm | ➡️ `npm-g` |

### 23.15 Service mesh / API gateway

| ID | Source | Install | Status |
|---|---|---|---|
| `deck` (Kong) | GH `Kong/deck` | binary | ⬜ |
| `tyk-cli` | GH `TykTechnologies/tyk` | binary | ⬜ |
| `kuma` (`kumactl`) | GH `kumahq/kuma` | binary | ⬜ |

### 23.16 Media / utilities

| ID | Source | Install | Status |
|---|---|---|---|
| `ffmpeg` | scoop/winget | ➡️ |
| `yt-dlp` | GH `yt-dlp/yt-dlp` | binary / pipx | ⬜ |
| `gallery-dl` | PyPI | pipx | ⬜ |
| `streamlink` | PyPI | pipx | ⬜ |
| `imagemagick` | winget | ➡️ |
| `exiftool` | winget | ➡️ |
| `mediainfo` | winget | ➡️ |

### 23.17 Niche languages

| ID | Source | Install | Status |
|---|---|---|---|
| `gleam` | GH `gleam-lang/gleam` | binary | ⬜ |
| `roc` | GH `roc-lang/roc` | binary | ⚠️ pre-1.0 |
| `v` (vlang) | GH `vlang/v` | binary | ⬜ |
| `carbon` | GH `carbon-language/carbon-lang` | source | ⚠️ experimental |
| `unison` | GH `unisonweb/unison` | binary | ⚠️ niche |
| `purescript` (`spago`) | npm | ➡️ `npm-g` |
| `elm` | npm | ➡️ `npm-g` |
| `idris2` | GH `idris-lang/Idris2` | source | ⚠️ niche |

### 23.18 Network / analysis

| ID | Source | Install | Status |
|---|---|---|---|
| `iperf3` | winget/scoop | ➡️ |
| `mtr` | OS pkg (WSL) | ➡️ |
| `tshark` | winget (Wireshark) | ➡️ |
| `speedtest-cli` | PyPI | pipx | ⬜ |
| `bandwhich` | crates.io | cargo | ⬜ |

### 23.19 Offensive security (gray zone)

> ⚠️ Dual-use pentesting / red-team tools. Implementation conditional on a declared use case (authorized audit, CTF, research). Out of scope by default unless explicitly requested.

| ID | Source | Install | Status |
|---|---|---|---|
| `nmap` | winget/scoop | ➡️ |
| `masscan` | GH `robertdavidgraham/masscan` | binary | ⚠️ |
| `amass` | GH `owasp-amass/amass` | binary | ⚠️ |
| `ffuf` | GH `ffuf/ffuf` | binary | ⚠️ |
| `gobuster` | GH `OJ/gobuster` | binary | ⚠️ |
| `sqlmap` | PyPI | pipx | ⚠️ |
| `hashcat` | hashcat.net | binary | ⚠️ |
| `john` | GH `openwall/john` | binary | ⚠️ |
| `aircrack-ng` | aircrack-ng.org | binary (WSL) | ⚠️ |
| `metasploit` | rapid7 | installer | ❌ kept out of scope (heavy, sensitive) |
| `mimikatz` / `responder` / `bloodhound` | misc | binary | ❌ kept out of scope |

### 23.20 Gaming / creative

| ID | Source | Install | Status |
|---|---|---|---|
| `godot` | GH `godotengine/godot` | binary | ⬜ |
| `love2d` | GH `love2d/love` | binary | ⬜ |
| `defold` | GH `defold/defold` | binary | ⬜ |
| `blender` / `obs` / `audacity` / `davinci` | winget | ➡️ |

### 23.21 Productivity / notes (CLI only)

| ID | Source | Install | Status |
|---|---|---|---|
| `joplin` | npm (CLI) | ➡️ `npm-g` |
| `silverbullet` | Deno | deno | ⬜ |
| `logseq` | winget | ➡️ |

---

## 24. Exhaustive niche inventory (maximum extended scope)

Additions to §22-23. All candidates ⬜ unless stated otherwise. Offensive / dual-use security excluded or marked ⚠️ with defensive use only (forensics, RE, audit). Items already listed in §22-23 are not repeated.

### 24.1 Version managers / runtime managers (additions)

| ID | Source | Install | Status |
|---|---|---|---|
| `mamba` | GH `mamba-org/mamba` | binary | ⬜ |
| `micromamba` | GH `mamba-org/mamba` | binary | ⬜ |
| `pixi` | GH `prefix-dev/pixi` | binary | ⬜ |
| `jenv` | GH `jenv/jenv` | binary (WSL) | ⬜ |
| `jabba` | GH `shyiko/jabba` | binary | ⬜ |
| `rbenv` | GH `rbenv/rbenv` | binary (WSL) | ⬜ |
| `rvm` | rvm.io | script (WSL) | ⬜ |
| `chruby` | GH `postmodern/chruby` | binary (WSL) | ⬜ |
| `frum` | GH `TaKO8Ki/frum` | binary | ⬜ |
| `nodenv` | GH `nodenv/nodenv` | binary (WSL) | ⬜ |
| `phpenv` | GH `phpenv/phpenv` | binary (WSL) | ⬜ |
| `crenv` | GH `crenv/crenv` | binary (WSL) | ⬜ |
| `kerl` | GH `kerl/kerl` | binary (WSL) | ⬜ |
| `choosenim` | GH `nim-lang/choosenim` | binary | ⬜ |
| `swiftenv` | GH `kylef/swiftenv` | binary (WSL) | ⬜ |
| `roswell` | GH `roswell/roswell` | binary | ⬜ |
| `gvm` | GH `moovweb/gvm` | binary (WSL) | ⬜ |
| `g` (go) | GH `stefanmaric/g` | npm | ⬜ |
| `goup` | GH `owenthereal/goup` | binary | ⬜ |
| `perlbrew` | GH `gugod/App-perlbrew` | script (WSL) | ⬜ |
| `plenv` | GH `tokuhirom/plenv` | binary (WSL) | ⬜ |

### 24.2 Extended Git tooling

| ID | Source | Install | Status |
|---|---|---|---|
| `gitui` | GH `extrawurst/gitui` | binary | ⬜ |
| `gex` | GH `Piturnah/gex` | binary | ⬜ |
| `onefetch` | GH `o2sh/onefetch` | binary | ⬜ |
| `git-cliff` | GH `orhun/git-cliff` | binary | ⬜ |
| `typos` | GH `crate-ci/typos` | binary | ⬜ |
| `difftastic` | GH `Wilfred/difftastic` | binary | ⬜ |
| `git-machete` | PyPI | pipx | ⬜ |
| `git-trim` | GH `foriequal0/git-trim` | binary | ⬜ |
| `git-absorb` | GH `tummychow/git-absorb` | binary | ⬜ |
| `git-imerge` | GH `mhagger/git-imerge` | pipx | ⬜ |
| `git-revise` | PyPI | pipx | ⬜ |
| `git-branchless` | GH `arxanas/git-branchless` | binary | ⬜ |
| `git-bug` | GH `MichaelMure/git-bug` | binary | ⬜ |
| `git-town` | GH `git-town/git-town` | binary | ⬜ |
| `commitlint` | npm | ➡️ `npm-g` |
| `semantic-release` | npm | ➡️ `npm-g` |
| `release-please` | npm | ➡️ `npm-g` |
| `conventional-changelog-cli` | npm | ➡️ `npm-g` |

### 24.3 Shells / multiplexers / terminals

| ID | Source | Install | Status |
|---|---|---|---|
| `nushell` | GH `nushell/nushell` | binary | ⬜ |
| `xonsh` | PyPI | pipx | ⬜ |
| `elvish` | GH `elves/elvish` | binary | ⬜ |
| `oils` (`osh`/`ysh`) | GH `oils-for-unix/oils` | binary (WSL) | ⬜ |
| `murex` | GH `lmorg/murex` | binary | ⬜ |
| `fish` | winget/scoop | ➡️ |
| `tmux` | OS pkg (WSL) | ➡️ |
| `mosh` | OS pkg (WSL) | ➡️ |
| `alacritty` | winget | ➡️ |
| `wezterm` | winget | ➡️ |
| `kitty` | OS pkg | ➡️ |
| `ghostty` | GH `ghostty-org/ghostty` | binary | ⬜ |

### 24.4 Charm / TUI ecosystem

| ID | Source | Install | Status |
|---|---|---|---|
| `gum` | GH `charmbracelet/gum` | binary | ⬜ |
| `glow` | GH `charmbracelet/glow` | binary | ⬜ |
| `vhs` | GH `charmbracelet/vhs` | binary | ⬜ |
| `mods` | GH `charmbracelet/mods` | binary | ⬜ |
| `pop` | GH `charmbracelet/pop` | binary | ⬜ |
| `huh` (CLI demos) | GH `charmbracelet/huh` | binary | ⬜ |
| `skate` | GH `charmbracelet/skate` | binary | ⬜ |
| `soft-serve` | GH `charmbracelet/soft-serve` | binary | ⬜ |
| `wishlist` | GH `charmbracelet/wishlist` | binary | ⬜ |
| `freeze` | GH `charmbracelet/freeze` | binary | ⬜ |

### 24.5 System monitoring / TUI

| ID | Source | Install | Status |
|---|---|---|---|
| `htop` | OS pkg | ➡️ apt |
| `btop` | winget | ➡️ |
| `glances` | PyPI | pipx | ⬜ |
| `atop` / `iotop` | apt | ➡️ |
| `nvtop` | GH `Syllo/nvtop` | binary (WSL) | ⬜ |
| `gpustat` | PyPI | pipx | ⬜ |
| `nethogs` / `iftop` | apt | ➡️ |
| `fastfetch` | GH `fastfetch-cli/fastfetch` | binary | ⬜ |
| `neofetch` | GH `dylanaraps/neofetch` | binary | ⬜ |
| `macchina` | GH `Macchina-CLI/macchina` | binary | ⬜ |
| `ncdu` | OS pkg | ➡️ |
| `gping` | GH `orf/gping` | binary | ⬜ |
| `procs` | GH `dalance/procs` | binary | ⬜ |
| `bandwhich` | GH `imsnif/bandwhich` | binary | ⬜ |
| `dog` (DNS) | GH `ogham/dog` | binary | ⬜ |
| `doggo` (DNS) | GH `mr-karan/doggo` | binary | ⬜ |

### 24.6 File managers / search

| ID | Source | Install | Status |
|---|---|---|---|
| `nnn` | GH `jarun/nnn` | binary (WSL) | ⬜ |
| `ranger` | PyPI | pipx | ⬜ |
| `lf` | GH `gokcehan/lf` | binary | ⬜ |
| `vifm` | OS pkg | ➡️ |
| `joshuto` | GH `kamiyaa/joshuto` | binary | ⬜ |
| `tre` | GH `dduan/tre` | binary | ⬜ |
| `pls` | GH `dhruvkb/pls` | binary | ⬜ |
| `mc` (Midnight Commander) | OS pkg | ➡️ |

### 24.7 Data manipulation / parsers

| ID | Source | Install | Status |
|---|---|---|---|
| `jc` | PyPI | pipx | ⬜ |
| `gron` | GH `tomnomnom/gron` | binary | ⬜ |
| `fx` | GH `antonmedv/fx` | binary | ⬜ |
| `dasel` | GH `TomWright/dasel` | binary | ⬜ |
| `jless` | GH `PaulJuliusMartinez/jless` | binary | ⬜ |
| `jaq` | GH `01mf02/jaq` | binary | ⬜ |
| `htmlq` | GH `mgdm/htmlq` | binary | ⬜ |
| `xq` | GH `kislyuk/yq` | pipx | ⬜ |
| `xidel` | GH `benibela/xidel` | binary | ⬜ |
| `xsv` | GH `BurntSushi/xsv` | binary | ⬜ |
| `miller` (`mlr`) | GH `johnkerl/miller` | binary | ⬜ |
| `csvkit` | PyPI | pipx | ⬜ |
| `visidata` | PyPI | pipx | ⬜ |
| `termgraph` | PyPI | pipx | ⬜ |
| `polars-cli` | crates.io | cargo | ⬜ |

### 24.8 SBOM / supply chain

| ID | Source | Install | Status |
|---|---|---|---|
| `cyclonedx-cli` | GH `CycloneDX/cyclonedx-cli` | binary | ⬜ |
| `cdxgen` | npm | ➡️ `npm-g` |
| `sbom-tool` | GH `microsoft/sbom-tool` | binary | ⬜ |
| `spdx-tools` | PyPI | pipx | ⬜ |
| `in-toto` | PyPI | pipx | ⬜ |
| `slsa-verifier` | GH `slsa-framework/slsa-verifier` | binary | ⬜ |
| `scorecard` | GH `ossf/scorecard` | binary | ⬜ |
| `allstar` | GH `ossf/allstar` | GH app | ⚠️ |

### 24.9 Container / image linters (defensive)

| ID | Source | Install | Status |
|---|---|---|---|
| `hadolint` | GH `hadolint/hadolint` | binary | ⬜ |
| `dockle` | GH `goodwithtech/dockle` | binary | ⬜ |
| `container-structure-test` | GH `GoogleContainerTools/container-structure-test` | binary | ⬜ |

### 24.10 Forensics / DFIR (defensive)

| ID | Source | Install | Status |
|---|---|---|---|
| `volatility3` | PyPI | pipx | ⬜ |
| `yara` | GH `VirusTotal/yara` | binary | ⬜ |
| `yara-x` | GH `VirusTotal/yara-x` | binary | ⬜ |
| `chainsaw` | GH `WithSecureLabs/chainsaw` | binary | ⬜ |
| `velociraptor` | GH `Velocidex/velociraptor` | binary | ⬜ |
| `osquery` | GH `osquery/osquery` | binary | ⬜ |
| `plaso` (`log2timeline`) | PyPI | pipx | ⬜ |
| `timesketch-cli` | PyPI | pipx | ⬜ |
| `sleuthkit` | GH `sleuthkit/sleuthkit` | binary (WSL) | ⬜ |
| `clamav` | winget | ➡️ |
| `lynis` | GH `CISOfy/lynis` | binary (WSL) | ⬜ |
| `rkhunter` / `chkrootkit` | apt | ➡️ |
| `wazuh-agent` | wazuh.com | binary | ⬜ |
| `aurora-agent` | GH `Neo23x0/aurora` | binary | ⬜ |

### 24.11 Reverse engineering / binary analysis (dual-use, defensive)

> ⚠️ Dual-use audit / malware-analysis tooling. Implementation conditional on a declared use case (research, CTF, threat intel).

| ID | Source | Install | Status |
|---|---|---|---|
| `radare2` | winget | ➡️ ⚠️ |
| `rizin` | GH `rizinorg/rizin` | binary | ⚠️ |
| `ghidra` | GH `NationalSecurityAgency/ghidra` | binary (JRE) | ⚠️ |
| `binwalk` | PyPI | pipx | ⚠️ |
| `cutter` | GH `rizinorg/cutter` | binary | ⚠️ |
| `iaito` | GH `radareorg/iaito` | binary | ⚠️ |

### 24.12 Hypervisors / VM CLIs

| ID | Source | Install | Status |
|---|---|---|---|
| `vagrant` | GH `hashicorp/vagrant` | binary | ⬜ |
| `multipass` | GH `canonical/multipass` | installer | ⬜ |
| `vboxmanage` (VirtualBox) | virtualbox.org | bundled | ⬜ |
| `govc` (vSphere) | GH `vmware/govmomi` | binary | ⬜ |
| `virsh` (libvirt) | apt | ➡️ |
| `qm` (Proxmox) | proxmox | bundled | ⬜ |
| `firecracker` | GH `firecracker-microvm/firecracker` | binary (WSL) | ⬜ |
| `ignite` (Firecracker via Weave) | GH `weaveworks/ignite` | binary | ⬜ |
| `lxc` / `incus` | linuxcontainers.org | apt (WSL) | ➡️ |
| `distrobox` | GH `89luca89/distrobox` | binary (WSL) | ⬜ |
| `toolbox` | GH `containers/toolbox` | binary (WSL) | ⬜ |

### 24.13 Databases — clients & shells

| ID | Source | Install | Status |
|---|---|---|---|
| `mongosh` | GH `mongodb-js/mongosh` | binary | ⬜ |
| `mongo-tools` | GH `mongodb/mongo-tools` | binary | ⬜ |
| `cqlsh` (Cassandra) | apache | bundled | ⬜ |
| `influx` CLI | GH `influxdata/influx-cli` | binary | ⬜ |
| `redis-cli` / `redis-tools` | OS pkg | ➡️ |
| `valkey-cli` | GH `valkey-io/valkey` | binary | ⬜ |
| `clickhouse-client` | GH `ClickHouse/ClickHouse` | binary | ⬜ |
| `cockroach` | GH `cockroachdb/cockroach` | binary | ⬜ |
| `mysqlsh` | dev.mysql.com | binary | ⬜ |
| `mariadb-cli` | mariadb.org | binary | ⬜ |
| `neo4j-admin` / `cypher-shell` | neo4j.com | bundled | ⬜ |
| `arangosh` | arangodb.com | bundled | ⬜ |
| `surreal` (SurrealDB) | GH `surrealdb/surrealdb` | binary | ⬜ |

### 24.14 PostgreSQL / migration extensions

| ID | Source | Install | Status |
|---|---|---|---|
| `gh-ost` | GH `github/gh-ost` | binary | ⬜ |
| `pt-online-schema-change` | percona.com | binary | ⬜ |
| `mydumper` / `myloader` | GH `mydumper/mydumper` | binary | ⬜ |
| `pgloader` | GH `dimitri/pgloader` | binary | ⬜ |
| `pgbouncer` | GH `pgbouncer/pgbouncer` | binary (WSL) | ⬜ |
| `pgcat` | GH `postgresml/pgcat` | binary | ⬜ |
| `pg_partman` | GH `pgpartman/pg_partman` | extension | ⬜ |
| `pgmetrics` | GH `rapidloop/pgmetrics` | binary | ⬜ |
| `pgbadger` | GH `darold/pgbadger` | binary (Perl) | ⬜ |
| `pgcenter` | GH `lesovsky/pgcenter` | binary | ⬜ |

### 24.15 Messaging / brokers / streaming (clients)

| ID | Source | Install | Status |
|---|---|---|---|
| `kcat` (ex `kafkacat`) | GH `edenhill/kcat` | binary | ⬜ |
| `kafkactl` | GH `deviceinsight/kafkactl` | binary | ⬜ |
| `redpanda-rpk` | GH `redpanda-data/redpanda` | binary | ⬜ |
| `nats-cli` | GH `nats-io/natscli` | binary | ⬜ |
| `nsq` (`nsq_to_*`) | GH `nsqio/nsq` | binary | ⬜ |
| `pulsar-shell` | GH `apache/pulsar` | bundled | ⬜ |
| `mosquitto` (`mosquitto_pub/sub`) | mosquitto.org | binary | ⬜ |
| `mqtt-cli` | GH `hivemq/mqtt-cli` | binary (JRE) | ⬜ |
| `centrifugo` | GH `centrifugal/centrifugo` | binary | ⬜ |
| `debezium-cli` | GH `debezium/debezium` | binary | ⬜ |

### 24.16 Search engines (servers + clients)

| ID | Source | Install | Status |
|---|---|---|---|
| `elasticsearch` | elastic.co | binary | ⬜ |
| `opensearch` | GH `opensearch-project/OpenSearch` | binary | ⬜ |
| `solr` | GH `apache/solr` | binary (JRE) | ⬜ |
| `zinc` | GH `zincsearch/zincsearch` | binary | ⬜ |
| `quickwit` | GH `quickwit-oss/quickwit` | binary | ⬜ |
| `vespa-cli` | GH `vespa-engine/vespa` | binary | ⬜ |
| `sonic` | GH `valeriansaliou/sonic` | binary | ⬜ |

### 24.17 Extended LLM / AI CLIs

| ID | Source | Install | Status |
|---|---|---|---|
| `llm` (Simon Willison) | PyPI | pipx | ⬜ |
| `shell-gpt` (`sgpt`) | PyPI | pipx | ⬜ |
| `aichat` | crates.io | cargo | ⬜ |
| `mods` (Charm) | ✓ §24.4 |
| `chatgpt-cli` | GH `j178/chatgpt` | binary | ⬜ |
| `gh-copilot` | gh extension | ➡️ `gh-ext` |
| `gh-models` | gh extension | ➡️ `gh-ext` |
| `whisper.cpp` (`main`) | GH `ggerganov/whisper.cpp` | binary | ⬜ |
| `whisperx` | PyPI | pipx | ⬜ |
| `piper` (TTS) | GH `rhasspy/piper` | binary | ⬜ |
| `bark` | PyPI | pipx | ⬜ |
| `autogen` | PyPI | pipx | ⬜ |
| `crewai` | PyPI | pipx | ⬜ |
| `dspy` | PyPI | pipx | ⬜ |
| `swe-agent` | GH `SWE-agent/SWE-agent` | manual | ⚠️ |
| `comfyui` | GH `comfyanonymous/ComfyUI` | manual | ⚠️ |
| `automatic1111` | GH `AUTOMATIC1111/stable-diffusion-webui` | manual | ⚠️ |
| `invokeai` | PyPI | pipx | ⬜ |
| `fooocus` | GH `lllyasviel/Fooocus` | manual | ⚠️ |

### 24.18 Vector DBs / RAG (extensions of §22.12 / §23.12)

| ID | Source | Install | Status |
|---|---|---|---|
| `milvus` (`milvus_cli`) | GH `milvus-io/milvus` | binary | ⬜ |
| `chroma` | PyPI | pipx | ⬜ |
| `pgvector` | GH `pgvector/pgvector` | PG extension | ⬜ |
| `vespa-cli` | ✓ §24.16 |

### 24.19 3D / CAD / 3D printing

| ID | Source | Install | Status |
|---|---|---|---|
| `octoprint` | PyPI | pipx | ⬜ |
| `prusaslicer` / `cura` / `freecad` / `meshlab` | winget | ➡️ |
| `blender` | winget | ➡️ |

### 24.20 Audio / video (CLIs)

| ID | Source | Install | Status |
|---|---|---|---|
| `yt-dlp` | GH `yt-dlp/yt-dlp` | binary / pipx | ⬜ |
| `gallery-dl` | PyPI | pipx | ⬜ |
| `streamlink` | PyPI | pipx | ⬜ |
| `sox` | OS pkg | ➡️ |
| `mlt` | OS pkg | ➡️ |
| `kdenlive` / `shotcut` / `audacity` / `obs-studio` | winget | ➡️ |
| `ffmpeg` / `imagemagick` / `exiftool` / `mediainfo` | winget | ➡️ |

### 24.21 Diagrams / visualization

| ID | Source | Install | Status |
|---|---|---|---|
| `mermaid-cli` (`mmdc`) | npm | ➡️ `npm-g` |
| `d2` | GH `terrastruct/d2` | binary | ⬜ |
| `plantuml` | GH `plantuml/plantuml` | binary (JRE) | ⬜ |
| `graphviz` (`dot`) | winget | ➡️ |
| `structurizr-cli` | GH `structurizr/cli` | binary (JRE) | ⬜ |
| `excalidraw-cli` | npm | ➡️ `npm-g` |

### 24.22 LaTeX / TeX

| ID | Source | Install | Status |
|---|---|---|---|
| `tlmgr` (TeX Live Manager) | TeX Live | bundled | ⬜ |
| `miktex-cli` (`mpm`) | miktex.org | bundled | ⬜ |
| `tectonic` | GH `tectonic-typesetting/tectonic` | binary | ⬜ |
| `chktex` / `latexindent` | TeX Live | bundled | ➡️ |
| `pandoc` | ✓ §23.2 |

### 24.23 Jupyter / notebooks

| ID | Source | Install | Status |
|---|---|---|---|
| `jupyter` / `jupyterlab` | PyPI | pipx | ⬜ |
| `voila` | PyPI | pipx | ⬜ |
| `nbconvert` | PyPI | pipx | ⬜ |
| `nbqa` | PyPI | pipx | ⬜ |
| `papermill` | PyPI | pipx | ⬜ |
| `jupytext` | PyPI | pipx | ⬜ |
| `marimo` | PyPI | pipx | ⬜ |

### 24.24 Scientific / statistical (CLIs)

| ID | Source | Install | Status |
|---|---|---|---|
| `octave` / `gnuplot` / `scilab` / `maxima` | winget | ➡️ |
| `sage` (SageMath) | sagemath.org | manual | ⚠️ |
| `gap` / `singular` / `pari` | binary | ⚠️ |
| `root` (CERN) | GH `root-project/root` | binary | ⚠️ |

### 24.25 Geo / GIS

| ID | Source | Install | Status |
|---|---|---|---|
| `gdal` (`ogr2ogr`) | winget | ➡️ |
| `proj` | OSGeo | ➡️ |
| `qgis` | winget | ➡️ |
| `tippecanoe` | GH `felt/tippecanoe` | binary (WSL) | ⬜ |
| `osmium` | GH `osmcode/osmium-tool` | binary (WSL) | ⬜ |
| `osm2pgsql` | GH `openstreetmap/osm2pgsql` | binary (WSL) | ⬜ |

### 24.26 Quantum computing / scientific frameworks

| ID | Source | Install | Status |
|---|---|---|---|
| `qiskit` | PyPI | pipx | ⬜ |
| `cirq` | PyPI | pipx | ⬜ |
| `pennylane` | PyPI | pipx | ⬜ |
| `braket-sdk` (AWS) | PyPI | pipx | ⬜ |
| `qsharp-cli` | crates.io / dotnet-tools | ➡️ `dotnet-tools` |

### 24.27 Productivity / tasks / time (CLI)

| ID | Source | Install | Status |
|---|---|---|---|
| `taskwarrior` | OS pkg | ➡️ |
| `timewarrior` | OS pkg | ➡️ |
| `vit` (taskwarrior TUI) | PyPI | pipx | ⬜ |
| `dstask` | GH `naggie/dstask` | binary | ⬜ |
| `todoist-cli` | GH `sachaos/todoist` | binary | ⬜ |
| `ticktick-cli` | npm | ➡️ `npm-g` |
| `khal` / `vdirsyncer` | PyPI | pipx | ⬜ |
| `gcalcli` | PyPI | pipx | ⬜ |

### 24.28 Templating / runtime configuration

| ID | Source | Install | Status |
|---|---|---|---|
| `gomplate` | GH `hairyhenderson/gomplate` | binary | ⬜ |
| `jinja2-cli` | PyPI | pipx | ⬜ |
| `esh` | GH `jirutka/esh` | binary (WSL) | ⬜ |
| `envsubst` (gettext) | OS pkg | ➡️ |
| `shdotenv` | GH `ko1nksm/shdotenv` | binary | ⬜ |
| `dotenv-cli` | npm | ➡️ `npm-g` |
| `chezmoi` | GH `twpayne/chezmoi` | binary | ⬜ |
| `yadm` | GH `TheLocehiliosan/yadm` | binary | ⬜ |

### 24.29 Recording / screencasts

| ID | Source | Install | Status |
|---|---|---|---|
| `asciinema` | PyPI | pipx | ⬜ |
| `terminalizer` | npm | ➡️ `npm-g` |
| `vhs` | ✓ §24.4 |
| `ttyrec` / `ttygif` | OS pkg | ➡️ |
| `agg` (asciinema → gif) | GH `asciinema/agg` | binary | ⬜ |

### 24.30 TUI readers / clients

| ID | Source | Install | Status |
|---|---|---|---|
| `newsboat` | GH `newsboat/newsboat` | binary (WSL) | ⬜ |
| `newsraft` | newsraft.org | binary (WSL) | ⬜ |
| `aerc` | GH `~rjarry/aerc` | binary (WSL) | ⬜ |
| `neomutt` | GH `neomutt/neomutt` | binary (WSL) | ⬜ |
| `lynx` / `w3m` / `elinks` | winget / apt | ➡️ |
| `browsh` | GH `browsh-org/browsh` | binary | ⬜ |
| `carbonyl` | GH `fathyb/carbonyl` | binary | ⬜ |
| `weechat` / `irssi` | apt | ➡️ |
| `gomuks` (Matrix TUI) | GH `tulir/gomuks` | binary | ⬜ |
| `matrix-commander` | PyPI | pipx | ⬜ |

### 24.31 Cloud / hosting (additions)

| ID | Source | Install | Status |
|---|---|---|---|
| `tccli` (Tencent) | GH `TencentCloud/tencentcloud-cli` | pipx | ⬜ |
| `jdcloud-cli` | GH `jdcloud-api/jdcloud-cli` | pipx | ⬜ |
| `huaweicloud-cli` | huaweicloud.com | binary | ⬜ |
| `ovh-cli` | GH `ovh/ovh-cli` | binary | ⬜ |
| `gandi-cli` | GH `Gandi/gandi.cli` | pipx | ⬜ |
| `equinix-metal` | GH `equinix/metal-cli` | binary | ⬜ |
| `mc` (MinIO client) | GH `minio/mc` | binary | ⬜ |
| `snowsql` | snowflake.com | binary | ⬜ |
| `databricks-cli` | PyPI | pipx | ⬜ |
| `bigquery` (`bq`) | bundled `gcloud` | ➡️ `gcloud` |
| `gsutil` | bundled `gcloud` | ➡️ `gcloud` |
| `aws-session-manager-plugin` | AWS | binary | ⬜ |

### 24.32 CI / CD platform clients

| ID | Source | Install | Status |
|---|---|---|---|
| `circleci-cli` | GH `CircleCI-Public/circleci-cli` | binary | ⬜ |
| `buildkite-agent` | GH `buildkite/agent` | binary | ⬜ |
| `drone-cli` | GH `harness/drone-cli` | binary | ⬜ |
| `woodpecker-cli` | GH `woodpecker-ci/woodpecker` | binary | ⬜ |
| `jenkins-cli` | jenkins.io | JAR | ⬜ |
| `octopus-cli` | GH `OctopusDeploy/cli` | binary | ⬜ |
| `harness-cli` | GH `harness/harness-cli` | binary | ⬜ |
| `semaphore-cli` | GH `semaphoreci/cli` | binary | ⬜ |
| `concourse-fly` | GH `concourse/concourse` | binary | ⬜ |

### 24.33 SIEM / logs / agents (defensive)

| ID | Source | Install | Status |
|---|---|---|---|
| `vector` (Datadog) | GH `vectordotdev/vector` | binary | ⬜ |
| `fluent-bit` | GH `fluent/fluent-bit` | binary | ⬜ |
| `fluentd` | RubyGems | gem | ⬜ |
| `promtail` | GH `grafana/loki` | binary | ⬜ |
| `elastic-agent` | elastic.co | binary | ⬜ |
| `filebeat` / `metricbeat` / `heartbeat` / `auditbeat` / `winlogbeat` | elastic.co | binary | ⬜ |
| `grafana-alloy` | GH `grafana/alloy` | binary | ⬜ |

### 24.34 Network analysis (defensive)

| ID | Source | Install | Status |
|---|---|---|---|
| `nmap` | winget | ➡️ |
| `zmap` | GH `zmap/zmap` | binary (WSL) | ⬜ |
| `arp-scan` | apt | ➡️ |
| `mtr` / `iperf3` | winget / apt | ➡️ |
| `dnscontrol` | GH `StackExchange/dnscontrol` | binary | ⬜ |
| `octodns` | PyPI | pipx | ⬜ |
| `wireguard-tools` | wireguard.com | binary | ⬜ |

### 24.35 Hardware monitoring

| ID | Source | Install | Status |
|---|---|---|---|
| `smartmontools` (`smartctl`) | winget | ➡️ |
| `ipmitool` | apt | ➡️ |
| `redfishtool` | GH `DMTF/Redfishtool` | pipx | ⬜ |
| `lm-sensors` | apt | ➡️ |

### 24.36 Crypto wallets / hardware (legit dev)

| ID | Source | Install | Status |
|---|---|---|---|
| `ledger-live-cli` | GH `LedgerHQ/ledger-live` | npm | ➡️ `npm-g` |
| `trezor-cli` (`trezorctl`) | PyPI | pipx | ⬜ |

### 24.37 Localization / i18n

| ID | Source | Install | Status |
|---|---|---|---|
| `crowdin-cli` | GH `crowdin/crowdin-cli` | binary (JRE) | ⬜ |
| `transifex-cli` | GH `transifex/cli` | binary | ⬜ |
| `weblate-cli` | PyPI | pipx | ⬜ |
| `lokalise-cli2` | GH `lokalise/lokalise-cli-2-go` | binary | ⬜ |
| `phraseapp-cli` | GH `phrase/phrase-cli` | binary | ⬜ |
| `i18next-cli` | npm | ➡️ `npm-g` |

### 24.38 Writing / editorial / accessibility

| ID | Source | Install | Status |
|---|---|---|---|
| `write-good` | npm | ➡️ `npm-g` |
| `alex` | npm | ➡️ `npm-g` |
| `mdslides` | PyPI | pipx | ⬜ |
| `axe-core-cli` | npm | ➡️ `npm-g` |
| `pa11y` | npm | ➡️ `npm-g` |
| `lighthouse` | npm | ➡️ `npm-g` |
| `sitespeed.io` | npm | ➡️ `npm-g` |

### 24.39 SSO / auth helpers (additions)

| ID | Source | Install | Status |
|---|---|---|---|
| `saml2aws` | GH `Versent/saml2aws` | binary | ⬜ |
| `aws-google-auth` | PyPI | pipx | ⬜ |
| `aws-okta` | GH `segmentio/aws-okta` | binary | ⬜ |
| `aws-azure-login` | npm | ➡️ `npm-g` |
| `gimme-aws-creds` | PyPI | pipx | ⬜ |
| `aws-export-credentials` | PyPI | pipx | ⬜ |

### 24.40 Niche scientific languages / DSLs

| ID | Source | Install | Status |
|---|---|---|---|
| `mojo` | modular.com | installer | ⚠️ pre-release |
| `bend` | GH `HigherOrderCO/Bend` | binary | ⚠️ pre-1.0 |
| `janet` | GH `janet-lang/janet` | binary | ⬜ |
| `fennel` | luarocks | ➡️ `luarocks` |
| `hy` | PyPI | pipx | ⬜ |
| `babashka` (`bb`) | GH `babashka/babashka` | binary | ⬜ |
| `clj-kondo` | GH `clj-kondo/clj-kondo` | binary | ⬜ |
| `leiningen` (`lein`) | leiningen.org | binary (JRE) | ⬜ |
| `scala-cli` | GH `VirtusLab/scala-cli` | binary | ⬜ |
| `mill` | GH `com-lihaoyi/mill` | binary (JRE) | ⬜ |
| `alire` (Ada) | GH `alire-project/alire` | binary | ⬜ |
| `cpanm` (Perl) | App::cpanminus | cpan | ⬜ |
| `zef` (Raku) | GH `ugexe/zef` | binary | ⬜ |
| `rebar3` (Erlang) | GH `erlang/rebar3` | binary | ⬜ |
| `shards` (Crystal) | GH `crystal-lang/shards` | binary | ⬜ |
| `dub` (D) | GH `dlang/dub` | binary | ⬜ |

### 24.41 API mock / proxy (dev)

| ID | Source | Install | Status |
|---|---|---|---|
| `mailpit` | GH `axllent/mailpit` | binary | ⬜ |
| `mailhog` | GH `mailhog/MailHog` | binary | ⚠️ archived |
| `smtp4dev` | GH `rnwood/smtp4dev` | dotnet-tools | ⬜ |
| `mailcatcher` | RubyGems | gem | ⬜ |
| `mockoon-cli` | npm | ➡️ `npm-g` |
| `prism` (Stoplight) | npm | ➡️ `npm-g` |
| `wiremock` | GH `wiremock/wiremock` | JAR | ⬜ |
| `mitmproxy` | PyPI | pipx | ⚠️ (audit only) |

### 24.42 Web performance / audit

| ID | Source | Install | Status |
|---|---|---|---|
| `lighthouse` | ✓ §24.38 |
| `pagespeed-insights` | npm | ➡️ `npm-g` |
| `webpagetest-cli` | npm | ➡️ `npm-g` |
| `sitespeed.io` | ✓ §24.38 |
| `unlighthouse` | npm | ➡️ `npm-g` |

### 24.43 Browser drivers (Selenium)

| ID | Source | Install | Status |
|---|---|---|---|
| `chromedriver` | chromium.org | binary | ⬜ |
| `geckodriver` | GH `mozilla/geckodriver` | binary | ⬜ |
| `edgedriver` | microsoft.com | binary | ⬜ |
| `selenium-manager` | bundled selenium | ➡️ |
| `webdriver-manager` | npm | ➡️ `npm-g` |

### 24.44 Profilers / tracing

| ID | Source | Install | Status |
|---|---|---|---|
| `py-spy` | PyPI | pipx | ⬜ |
| `austin` | GH `P403n1x87/austin` | binary | ⬜ |
| `scalene` | PyPI | pipx | ⬜ |
| `speedscope` | npm | ➡️ `npm-g` |
| `flamegraph` | GH `brendangregg/FlameGraph` | binary (Perl) | ⬜ |
| `cargo-flamegraph` | crates.io | cargo | ➡️ `cargo` |
| `async-profiler` | GH `async-profiler/async-profiler` | binary (JVM) | ⬜ |
| `pprof` | GH `google/pprof` | binary (Go) | ⬜ |

### 24.45 Static site / blog (additional)

| ID | Source | Install | Status |
|---|---|---|---|
| `eleventy` (`@11ty/eleventy`) | npm | ➡️ `npm-g` |
| `astro` | npm | ➡️ `npm-g` |
| `nextra` | npm | ➡️ `npm-g` |
| `pelican` | PyPI | pipx | ⬜ |
| `nikola` | PyPI | pipx | ⬜ |
| `middleman` | RubyGems | gem | ⬜ |
| `bridgetown` | RubyGems | gem | ⬜ |

### 24.46 Hardware / industrial

| ID | Source | Install | Status |
|---|---|---|---|
| `mqtt-cli` | ✓ §24.15 |
| `node-red` | npm | ➡️ `npm-g` |
| `homeassistant-cli` (`hass-cli`) | PyPI | pipx | ⬜ |
| `thingsboard-cli` | thingsboard.io | binary (JRE) | ⚠️ |
| `opcua-client` | PyPI | pipx | ⚠️ niche |

### 24.47 Workflow / task runners (additions)

| ID | Source | Install | Status |
|---|---|---|---|
| `n8n` | npm | ➡️ `npm-g` |
| `temporal-cli` | ✓ §23.6 |
| `cadence-cli` | GH `uber/cadence` | binary | ⬜ |
| `windmill` | GH `windmill-labs/windmill` | binary | ⬜ |
| `argo-events` | argoproj | binary | ⬜ |

### 24.48 Self-hosted services / dev infra (additions to §23.13)

| ID | Source | Install | Status |
|---|---|---|---|
| `gitea` | GH `go-gitea/gitea` | binary | ⬜ |
| `forgejo` | codeberg.org `forgejo/forgejo` | binary | ⬜ |
| `gitlab-runner` | gitlab.com | binary | ⬜ |
| `keycloak` | ✓ §23.8 |
| `minio` (server) | GH `minio/minio` | binary | ⬜ |
| `seaweedfs` | GH `seaweedfs/seaweedfs` | binary | ⬜ |
| `garage` | git.deuxfleurs.fr | binary | ⬜ |
| `meilisearch` | ✓ §23.12 |
| `plausible` | GH `plausible/community-edition` | docker | ⚠️ docker-only |
| `umami` | GH `umami-software/umami` | docker / npm | ⚠️ |

### 24.49 Config-as-code (additions to §23.11)

All entries in §23.11 (`cue`, `jsonnet`, `dhall`, `nickel`, `pkl`) remain valid. No additions.

### 24.50 Modern dev utils (additions to §22.12)

Complements to the tools already on winget/scoop. A dedicated provider only when specific GH tracking is desired:

`bat`, `eza`, `fd`, `ripgrep`, `fzf`, `zoxide`, `hyperfine`, `tokei`, `jq`, `yq`, `xh`, `gum`, `glow`, `direnv`, `watchexec`, `dust`, `duf`, `procs`, `bottom`, `zellij`, `helix`, `broot`, `atuin`, `pueue`, `mcfly`, `carapace`, `ouch`, `sd`, `choose`, `entr`, `mob`, `lefthook`, `chezmoi`, `yadm`, `direnv`, `delta`, `viu`, `chafa`, `nb`, `tldr` (`tealdeer`), `cheat`, `navi`, `eg`, `bashtop`, `up`, `peco`, `kotlin-native`, `cargo-watch`, `nvm` (wsl).

---

## 25. Implementation priority order

1. **`gh-releases` meta-provider (§21)** — unlocks ~70% of the candidates below in the form of TOML config.
2. **Security**: `gitleaks`, `trufflehog`, `osv-scanner`, `checkov`, `conftest`, `opa`, `infracost`.
3. **Kubernetes ops**: `k9s`, `stern`, `kubectx`, `kubeseal`, `velero`, `istioctl`, `eksctl`.
4. **Secrets / PKI**: `sops`, `age`, `step`, `mkcert`.
5. **DB migrations**: `atlas`, `golang-migrate`, `dbmate`.
6. **Containers**: `skopeo`, `crane`, `ko`, `earthly`, `dagger`.
7. **Cloud gaps**: `ibmcloud`, `yc`, `aliyun`, `civo`.
8. **LLM**: `ollama`, `huggingface-cli`, `aider`.
9. **Languages**: `ghcup`, `foundry`, `solana`, `tauri-cli`.
10. **Tunneling / web**: `cloudflared`, `tailscale`, `caddy`.
