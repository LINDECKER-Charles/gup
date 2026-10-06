# pip-system-site

## Fixed

- **providers/python:** `pip` also lists and upgrades the site-packages of the Python behind the
  `pip` on `PATH` when that folder is the user's to write — a python.org install "for me only", a
  Python in a folder of the user's, pyenv — instead of the user site alone, which hid 73 of 75
  outdated packages on one machine and kept a pin held there (`opentelemetry-proto` capping
  `protobuf` below 7) from ever being lifted. Each package is upgraded, and put back after a
  breaking upgrade, in the site it lives in: without `--user` there, which would only have added a
  shadowing copy. The folder is left alone when it is externally managed (PEP 668: Homebrew,
  Debian), belongs to a virtual or conda environment, or is not writable (`fix(providers/python):
  cover the site-packages of a user-owned Python`)

## Internal

- **providers:** `self` (for pip) and `semgrep` share one lookup of the Python interpreter behind
  a console script on `PATH`, which the pip provider now uses too; `self`'s also finds a virtual
  environment's `Scripts\python.exe` (`refactor(providers): share the lookup of a script's Python
  interpreter`)
