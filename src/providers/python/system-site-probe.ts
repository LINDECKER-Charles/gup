/**
 * A Python script, run as `python -I -c`, that prints the interpreter's own
 * site-packages folders as a JSON list — an empty list when gup must leave
 * them to someone else:
 *
 * - externally managed (PEP 668: Homebrew, Debian…), where pip refuses to
 *   install and the system's package manager upgrades them; the marker is
 *   where pip itself looks for it;
 * - a virtual or conda environment: a project's packages, or conda's;
 * - a folder the user may not write (Program Files, /usr), where pip falls
 *   back to the user site anyway. Writing a file is the test that counts:
 *   Windows ACLs are invisible to `os.access`, which is why pip tests the
 *   same way.
 *
 * `-I` keeps the user's current folder off `sys.path`, so a stray `json.py`
 * there is never imported. Exported for the tests, which script its argv.
 */
export const SYSTEM_SITE_PROBE = [
  "import json, os, sys, sysconfig, tempfile",
  "def writable(folder):",
  "    try:",
  "        tempfile.TemporaryFile(dir=folder).close()",
  "        return True",
  "    except OSError:",
  "        return False",
  "folders = sorted({sysconfig.get_path('purelib'), sysconfig.get_path('platlib')})",
  "stdlib = sysconfig.get_path('stdlib')",
  "managed = os.path.isfile(os.path.join(stdlib, 'EXTERNALLY-MANAGED'))",
  "conda = os.path.isdir(os.path.join(sys.prefix, 'conda-meta'))",
  "environment = sys.prefix != sys.base_prefix or conda",
  "owned = not managed and not environment and all(map(writable, folders))",
  "print(json.dumps(folders if owned else []))",
].join("\n");
