#!/usr/bin/env python3
"""Mirrobot share-link decryptor + session viewer.

Upstream opencode discontinued share links; the platform now produces
encrypted session artifacts (MRB2) plus, optionally, live share URLs on
our own worker. This tool decrypts both. Session payloads carry the raw
`opencode export` family and a self-contained snapshot HTML (built by
OpenShare's snapshot tools at export time) - decrypting writes them to
the local library and opens the snapshot straight from disk (file://).
No viewer server, no ports, no dist, no node needed locally.

Wire formats:
  MRB1.<b64>                    legacy: RSA-OAEP(share URL)
  MRB2.<b64>.<b64>.<b64>        new: RSA-OAEP(AES key) . iv . AES-256-CBC
                               payload (gzipped JSON). format=osh-passive
                               carries {meta, exports, snapshot_html};
                               kind=meta points at the Actions artifact
                               (auto-fetched via gh) and may carry a live
                               worker URL (opened directly); legacy
                               kind=session items-only payloads are
                               written as raw items (pre-snapshot era).

Usage:
  python decrypt_share_link.py                 # interactive TUI
  python decrypt_share_link.py "<pasted text>" # one-shot decrypt
  python decrypt_share_link.py "<blob>" --open # decrypt + open browser
  python decrypt_share_link.py --file <enc>    # decrypt an artifact file
  python decrypt_share_link.py setup           # keygen + push repo secret
  python decrypt_share_link.py library         # list cached sessions
  python decrypt_share_link.py config show
  python decrypt_share_link.py config set <key> <value>
  python decrypt_share_link.py --self-test

Config: ~/.config/mirrobot/config.json
  private_key_path   (default ~/.config/mirrobot/share-link.pem, env
                      MIRROBOT_SHARE_KEY overrides)
  persist            (default false - nothing written to disk until you
                      explicitly enable it; created only on change)
  log_path           (default ~/.config/mirrobot/decryptions.jsonl)
  session_cache_days (default 30; library session directories older than
                      this are evicted on each run. 0 = keep forever)
  library_dir        (default ~/.cache/mirrobot/sessions)

Requires `openssl` on PATH (Git for Windows, macOS, Linux all ship it);
`gh` only for the run browser / artifact auto-fetch.
"""

from __future__ import annotations

import base64
import gzip
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import webbrowser
import zipfile
from datetime import datetime
from pathlib import Path

# Locale-proof console output (box-drawing chars die on cp1251 consoles).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BLOB_RE = re.compile(r"MRB1\.([A-Za-z0-9+/=]+)")
BLOB2_RE = re.compile(r"MRB2\.([A-Za-z0-9+/=]+)\.([A-Za-z0-9+/=]+)\.([A-Za-z0-9+/=]+)")
CTX_RE = re.compile(r"^context:\s*(.+)$", re.MULTILINE)

CONFIG_DIR = Path.home() / ".config" / "mirrobot"
CONFIG_PATH = CONFIG_DIR / "config.json"
DEFAULT_KEY = CONFIG_DIR / "share-link.pem"
DEFAULT_LOG = CONFIG_DIR / "decryptions.jsonl"
DEFAULT_LIBRARY = Path.home() / ".cache" / "mirrobot" / "sessions"

DEFAULTS = {
    "private_key_path": str(DEFAULT_KEY),
    "persist": False,
    "log_path": str(DEFAULT_LOG),
    "session_cache_days": 30,
    "library_dir": str(DEFAULT_LIBRARY),
}


# ----------------------------------------------------------------------------
# config
# ----------------------------------------------------------------------------

def load_config() -> dict:
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    if os.environ.get("MIRROBOT_SHARE_KEY"):
        cfg["private_key_path"] = os.environ["MIRROBOT_SHARE_KEY"]
    return cfg


def save_config(cfg: dict) -> None:
    clean = {k: cfg[k] for k in DEFAULTS if k in cfg}
    if os.environ.get("MIRROBOT_SHARE_KEY"):
        clean["private_key_path"] = DEFAULTS["private_key_path"]
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(clean, indent=2) + "\n", encoding="utf-8"
    )


# ----------------------------------------------------------------------------
# crypto (openssl subprocess)
# ----------------------------------------------------------------------------

def find_openssl() -> str:
    exe = shutil.which("openssl")
    if not exe:
        sys.exit("error: openssl not found on PATH")
    return exe


def openssl_decrypt(openssl: str, key: Path, ciphertext: bytes) -> bytes:
    p = subprocess.run(
        [openssl, "pkeyutl", "-decrypt", "-inkey", str(key),
         "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
        input=ciphertext, capture_output=True,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode(errors="replace").strip()[:200])
    return p.stdout


def openssl_aes_decrypt(aes_key: bytes, iv: bytes, ct: bytes) -> bytes:
    p = subprocess.run(
        [find_openssl(), "enc", "-d", "-aes-256-cbc",
         "-K", aes_key.hex(), "-iv", iv.hex()],
        input=ct, capture_output=True,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode(errors="replace").strip()[:200])
    return p.stdout


def maybe_gunzip(data: bytes) -> bytes:
    if data[:2] == b"\x1f\x8b":
        return gzip.decompress(data)
    return data


def decrypt_mrb2(m: re.Match, key_path: Path) -> dict:
    from_base64 = lambda s: base64.b64decode(s + "=" * (-len(s) % 4))  # noqa: E731
    aes_key = openssl_decrypt(find_openssl(), key_path, from_base64(m.group(1)))
    iv = from_base64(m.group(2))
    plain = maybe_gunzip(openssl_aes_decrypt(aes_key, iv, from_base64(m.group(3))))
    return json.loads(plain.decode("utf-8"))


def decrypt_blob(blob_b64: str, key_path: Path) -> str:
    ct = base64.b64decode(blob_b64 + "=" * (-len(blob_b64) % 4))
    return openssl_decrypt(find_openssl(), key_path, ct).decode("utf-8")


def parse_input(text: str) -> tuple[str | None, str | None]:
    m2 = BLOB2_RE.search(text)
    if m2:
        return m2.group(0), None
    m = BLOB_RE.search(text)
    ctx_m = CTX_RE.search(text)
    return (m.group(1) if m else None,
            ctx_m.group(1) if ctx_m else None)


def append_log(cfg: dict, line: str, ctx: str | None) -> None:
    if not cfg.get("persist"):
        return
    log = Path(cfg["log_path"])
    log.parent.mkdir(parents=True, exist_ok=True)
    entry = {"ts": datetime.now().isoformat(timespec="seconds"),
             "url": line, "context": ctx or ""}
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------------------
# gh (run browser + artifact auto-fetch)
# ----------------------------------------------------------------------------

def find_gh() -> str | None:
    return shutil.which("gh")


def gh_repo(gh: str) -> str | None:
    p = subprocess.run([gh, "repo", "view", "--json", "nameWithOwner",
                        "-q", ".nameWithOwner"], capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip():
        return None
    return p.stdout.strip()


def gh_token(gh: str) -> str | None:
    p = subprocess.run([gh, "auth", "token"], capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 and p.stdout.strip() else None


def _ssl_context_with_fallback_cas() -> "ssl.SSLContext | None":
    """Windows python often ships without usable CA roots; fall back to
    well-known CA bundles on disk (Git for Windows, curl) when present."""
    import ssl
    candidates = [
        Path(r"C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"),
        Path(r"C:\Program Files\Git\usr\ssl\certs\ca-bundle.crt"),
        Path("/etc/ssl/certs/ca-certificates.crt"),
        Path("/etc/pki/tls/certs/ca-bundle.crt"),
    ]
    for c in candidates:
        if c.exists():
            try:
                return ssl.create_default_context(cafile=str(c))
            except Exception:
                continue
    return None


def _http_get(url: str, headers: dict, timeout: int = 120) -> bytes:
    """GET with CA fallback; Authorization is NEVER forwarded across a
    redirect (the artifact storage host rejects foreign bearer tokens -
    live-caught 401)."""
    import urllib.error
    req = urllib.request.Request(url, headers=headers)
    opener = urllib.request.build_opener(_NoAuthRedirect)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.URLError as exc:
        if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
            raise
        ctx = _ssl_context_with_fallback_cas()
        if not ctx:
            raise
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.read()


class _NoAuthRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        clean = {k: v for k, v in req.headers.items()
                 if k.lower() not in ("authorization", "user-agent")}
        clean["user-agent"] = "mirrobot-decrypt/1.0"
        new = urllib.request.Request(newurl, headers=clean, method="GET")
        return new


def api_get(url: str, token: str | None) -> bytes:
    headers = {"user-agent": "mirrobot-decrypt/1.0"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return _http_get(url, headers)


def fetch_artifact_enc(repo: str, run_id: str, name: str, token: str | None) -> bytes:
    """Download a session-*.enc Actions artifact (zip) and return the .enc
    payload bytes. Name matches by exact name or .enc suffix."""
    runs = json.loads(api_get(
        f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts",
        token))
    art = None
    for a in runs.get("artifacts", []):
        if a.get("name") == name or a.get("name", "").endswith(".enc"):
            art = a
            break
    if not art:
        raise RuntimeError(f"artifact not found in run {run_id}")
    raw = api_get(art["archive_download_url"], token)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        for n in zf.namelist():
            if n.endswith(".enc"):
                return zf.read(n)
    raise RuntimeError("no .enc file inside the artifact zip")


# ----------------------------------------------------------------------------
# session library (plain files; snapshots open via file://)
# ----------------------------------------------------------------------------

def library_write(cfg: dict, payload: dict) -> tuple[Path, Path | None]:
    """Write one library entry: <lib>/<runid>-<sid>/ with meta.json,
    exports/<session>.json and snapshot.html when the payload carries one.
    Returns (entry_dir, snapshot_path_or_None)."""
    lib = Path(cfg["library_dir"])
    lib.mkdir(parents=True, exist_ok=True)
    sid = str(payload.get("session_id") or "session")
    run = str(payload.get("run_id") or "local")
    entry = lib / f"{run}-{sid[:16].replace('/', '_')}"
    if entry.exists():
        shutil.rmtree(entry, ignore_errors=True)
    entry.mkdir(parents=True)

    meta = {k: payload.get(k) for k in
            ("repo", "run_id", "session_id", "ts", "live", "snapshot", "snapshot_note")
            if payload.get(k) is not None}
    (entry / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    snapshot: Path | None = None
    if payload.get("format") == "osh-passive":
        exports = payload.get("exports") or {}
        edir = entry / "exports"
        edir.mkdir()
        for esid, export in exports.items():
            (edir / f"{esid}.json").write_text(
                json.dumps(export, ensure_ascii=False), encoding="utf-8")
        html = payload.get("snapshot_html")
        if html:
            snapshot = entry / "snapshot.html"
            snapshot.write_text(html, encoding="utf-8")
    else:
        # legacy pre-snapshot payloads: raw items, no embedded page
        (entry / "items.json").write_text(
            json.dumps(payload.get("data") or [], ensure_ascii=False),
            encoding="utf-8")

    # Evict expired entries (0 = keep forever).
    days = int(cfg.get("session_cache_days") or 0)
    if days > 0:
        cutoff = time.time() - days * 86400
        for d in lib.iterdir():
            if d.is_dir() and d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)
    return entry, snapshot


def page_url(path: Path) -> str:
    return path.resolve().as_uri()


# ----------------------------------------------------------------------------
# presentation
# ----------------------------------------------------------------------------

def show_result(url: str, ctx: str | None, opened: bool = False) -> None:
    print()
    print("\N{BOX DRAWINGS LIGHT HORIZONTAL}" * 52)
    print("  decrypted:")
    print()
    print(url)  # bare URL on its own line - clickable in most terminals
    print()
    if ctx:
        for part in ctx.split("|"):
            print(f"    {part.strip()}")
        print()
    if opened:
        print("  (opened in browser)")
    print("\N{BOX DRAWINGS LIGHT HORIZONTAL}" * 52)


# ----------------------------------------------------------------------------
# decrypt flows
# ----------------------------------------------------------------------------

def handle_mrb2(m: re.Match, cfg: dict, open_browser: bool) -> bool:
    key = Path(cfg["private_key_path"])
    if not key.exists():
        print(f"private key not found: {key}")
        return False
    try:
        payload = decrypt_mrb2(m, key)
    except (RuntimeError, json.JSONDecodeError) as exc:
        print(f"error: {exc}")
        return False

    fmt = payload.get("format")
    kind = payload.get("kind")

    if fmt == "osh-passive" or kind == "session":
        entry, snapshot = library_write(cfg, payload)
        live = payload.get("live") or {}
        ctx_bits = [f"session {payload.get('session_id', '?')}",
                    str(payload.get("repo", "?")), f"run {payload.get('run_id', '?')}"]
        if live.get("url"):
            ctx_bits.append(f"live share {live.get('status') or '?'}"
                            f" (gated {'yes' if live.get('gated') else 'no'})")
        ctx_bits.append(f"snapshot {payload.get('snapshot') or 'none'}")
        if snapshot:
            url = page_url(snapshot)
            if open_browser:
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
            show_result(url, " | ".join(ctx_bits), open_browser)
        else:
            note = payload.get("snapshot_note") or (
                "pre-snapshot artifact: raw exports written, no embedded page"
                if fmt != "osh-passive" else "snapshot was unavailable at export time")
            show_result(page_url(entry), " | ".join(ctx_bits) + f" | {note}", False)
        append_log(cfg, page_url(entry), " | ".join(ctx_bits))
        return True

    if kind == "meta":
        live = payload.get("url")
        artifact = payload.get("artifact")
        if live:
            ctx = (f"live share | {payload.get('repo', '?')} | "
                   f"run {payload.get('run_id', '?')}"
                   + (f" | share {payload.get('share_id')}"
                      f" {payload.get('share_status') or '?'}"
                      f" gated {'yes' if payload.get('share_gated') else 'no'}"
                      if payload.get("share_id") else ""))
            if open_browser:
                try:
                    webbrowser.open(live)
                except Exception:
                    pass
            show_result(live, ctx, open_browser)
        if artifact:
            gh = find_gh()
            token = gh_token(gh) if gh else os.environ.get("GITHUB_TOKEN")
            if not token:
                print("gh CLI/token needed to auto-fetch the artifact - "
                      "decrypt the artifact file manually")
                return bool(live)
            print(f"fetching artifact {artifact} from "
                  f"{payload.get('repo')} run {payload.get('run_id')} ...")
            try:
                enc = fetch_artifact_enc(payload.get("repo", ""),
                                         str(payload.get("run_id", "")),
                                         artifact, token)
            except (RuntimeError, Exception) as exc:
                print(f"artifact fetch failed: {exc}")
                return bool(live)
            enc_text = enc.decode("utf-8", errors="replace")
            m2 = BLOB2_RE.search(enc_text)
            if not m2:
                print("artifact does not contain an MRB2 blob")
                return bool(live)
            return handle_mrb2(m2, cfg, open_browser)
        return bool(live)

    print(f"unknown MRB2 payload kind: {kind}")
    return False


def decrypt_flow(text: str, cfg: dict, open_browser: bool) -> bool:
    m2 = BLOB2_RE.search(text)
    if m2:
        return handle_mrb2(m2, cfg, open_browser)
    blob, ctx = parse_input(text)
    if blob:
        key = Path(cfg["private_key_path"])
        if not key.exists():
            print(f"private key not found: {key}")
            print("set private_key_path in config or $MIRROBOT_SHARE_KEY")
            return False
        try:
            url = decrypt_blob(blob, key)
        except RuntimeError as exc:
            print(f"error: {exc}")
            return False
        if open_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        show_result(url, ctx, open_browser)
        if cfg.get("persist"):
            append_log(cfg, url, ctx)
        return True
    print("no MRB1/MRB2 blob found in the input")
    return False


# ----------------------------------------------------------------------------
# setup
# ----------------------------------------------------------------------------

SETUP_STEPS = """
Manual steps (gh CLI not available or not in a repo):
  1. Generate the keypair (once, keep the private key private):
       openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \\
         -out ~/.config/mirrobot/share-link.pem
  2. Export the public key:
       openssl pkey -in ~/.config/mirrobot/share-link.pem -pubout
  3. Add it as the repo secret SESSION_ARTIFACT_PUBKEY:
       Settings -> Secrets and variables -> Actions -> New repository secret
       (or:  gh secret set SESSION_ARTIFACT_PUBKEY --repo OWNER/REPO < pub.pem )
"""


def cmd_setup() -> int:
    cfg = load_config()
    openssl = find_openssl()
    key = Path(cfg["private_key_path"])
    if key.exists():
        print(f"private key already present: {key}")
    else:
        key.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [openssl, "genpkey", "-algorithm", "RSA",
             "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key)],
            check=True)
        print(f"generated private key: {key}")
    pub = subprocess.run(
        [openssl, "pkey", "-in", str(key), "-pubout"],
        capture_output=True, check=True).stdout.decode()
    print("\npublic key (for the SESSION_ARTIFACT_PUBKEY repo secret):\n")
    print(pub)
    gh = find_gh()
    if gh:
        repo = gh_repo(gh)
        if repo:
            push = input(f"push as secret SESSION_ARTIFACT_PUBKEY to {repo}? [y/N] ")
            if push.strip().lower() == "y":
                p = subprocess.run(
                    [gh, "secret", "set", "SESSION_ARTIFACT_PUBKEY", "--repo", repo],
                    input=pub.encode())
                print("secret set" if p.returncode == 0 else "secret set failed")
                return 0 if p.returncode == 0 else 1
    print(SETUP_STEPS)
    return 0


# ----------------------------------------------------------------------------
# run browser
# ----------------------------------------------------------------------------

def list_runs(gh: str, repo: str, limit: int = 15) -> list[dict]:
    token = gh_token(gh)
    data = json.loads(api_get(
        f"https://api.github.com/repos/{repo}/actions/runs"
        f"?per_page={limit}", token))
    return data.get("workflow_runs", [])


def runs_blobs(gh: str, repo: str, run_id: int) -> list[tuple[str, str]]:
    """Returns [(blob-or-MRB2-text, context)] found in the run's logs."""
    token = gh_token(gh)
    raw = api_get(
        f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/logs",
        token)
    found: list[tuple[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        for name in zf.namelist():
            if not name.endswith(".txt"):
                continue
            text = zf.read(name).decode("utf-8", errors="replace")
            for mm in BLOB2_RE.finditer(text):
                found.append((mm.group(0), ""))
                break
            for m in BLOB_RE.finditer(text):
                ctx_m = CTX_RE.search(text)
                found.append((f"MRB1.{m.group(1)}", ctx_m.group(1) if ctx_m else ""))
    seen, out = set(), []
    for b, c in found:
        if b not in seen:
            seen.add(b)
            out.append((b, c))
    return out


def tui_browse(cfg: dict) -> None:
    gh = find_gh()
    if not gh:
        print("gh CLI not found - the run browser needs it "
              "(https://cli.github.com/)")
        return
    repo = gh_repo(gh)
    if not repo:
        print("not inside a GitHub repository (or gh is not authenticated)")
        return
    runs = list_runs(gh, repo)
    if not runs:
        print(f"no workflow runs found in {repo}")
        return
    print(f"\n  recent runs in {repo}:")
    for i, r in enumerate(runs, 1):
        print(f"  {i:2}) [{r.get('conclusion') or r.get('status', '?'):>8}] "
              f"{r.get('name', '?')[:38]:<38} "
              f"{r.get('created_at', '')[5:16].replace('T', ' ')}  "
              f"#{r.get('run_number', '?')}")
    sel = input("\n  run number to inspect (Enter = cancel): ").strip()
    if not sel.isdigit() or not (1 <= int(sel) <= len(runs)):
        return
    run = runs[int(sel) - 1]
    print(f"  fetching logs for "
          f"{run.get('name')} #{run.get('run_number')} ...")
    try:
        blobs = runs_blobs(gh, repo, run["id"])
    except Exception as exc:
        print(f"  could not fetch logs: {exc}")
        return
    if not blobs:
        print("  no encrypted share blobs found in this run's logs "
              "(pre-filter era, or agent step never ran)")
        return
    for blob, _ in blobs:
        if not decrypt_flow(blob, cfg, open_browser=False):
            continue
        input("[Enter] next: ")


def cmd_library(cfg: dict) -> None:
    lib = Path(cfg["library_dir"])
    if not lib.exists():
        print("no session library yet (nothing decrypted)")
        return
    for d in sorted(lib.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not d.is_dir():
            continue
        snap = d / "snapshot.html"
        target = page_url(snap if snap.exists() else d)
        mark = "snapshot" if snap.exists() else "raw"
        print(f"  {datetime.fromtimestamp(d.stat().st_mtime).strftime('%Y-%m-%d %H:%M')}  "
              f"{d.name:46} [{mark}]  {target}")


# ----------------------------------------------------------------------------
# TUI
# ----------------------------------------------------------------------------

MENU = """
\N{BOX DRAWINGS LIGHT DOWN AND RIGHT}{line}\N{BOX DRAWINGS LIGHT DOWN AND LEFT}
  Mirrobot Share Decryptor + Session Viewer
\N{BOX DRAWINGS LIGHT UP AND RIGHT}{line}\N{BOX DRAWINGS LIGHT UP AND LEFT}
  1) decrypt (blob / run summary paste)  4) browse workflow runs
  2) view decryption log                 5) session library
  3) settings                            6) setup / keygen
  q) quit
"""


def read_paste() -> str:
    print("paste the encrypted block (finish with an empty line):")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "" and lines:
            break
        lines.append(line)
    return "\n".join(lines)


def tui_decrypt(cfg: dict) -> None:
    text = read_paste()
    decrypt_flow(text, cfg, open_browser=True)


def tui_log(cfg: dict) -> None:
    log = Path(cfg["log_path"])
    if not log.exists():
        print("no decryption log yet"
              + ("" if cfg.get("persist") else " (persistence is off)"))
        return
    for raw in log.read_text(encoding="utf-8").splitlines():
        try:
            e = json.loads(raw)
            print(f"  {e.get('ts','?')}  {e.get('url','?')}")
            if e.get("context"):
                print(f"      {e['context']}")
        except json.JSONDecodeError:
            print(f"  {raw}")


def tui_settings(cfg: dict) -> dict:
    while True:
        print()
        print(f"  private key        : {cfg['private_key_path']}")
        print(f"  persist            : {'on' if cfg.get('persist') else 'off'}")
        print(f"  log file           : {cfg['log_path']}")
        print(f"  session cache days : {cfg.get('session_cache_days', 30)} (0 = keep forever)")
        print(f"  library dir        : {cfg['library_dir']}")
        print(f"  config file        : {CONFIG_PATH}"
              + ("" if CONFIG_PATH.exists() else "  (not created yet)"))
        print()
        print("  1) toggle persist      2) set private key path")
        print("  3) set log path        4) set session cache days")
        print("  5) set library dir     b) back")
        c = input("> ").strip().lower()
        if c == "1":
            cfg["persist"] = not cfg.get("persist", False)
            save_config(cfg)
            print(f"  persist is now {'on' if cfg['persist'] else 'off'}"
                  " - config file written")
        elif c == "2":
            v = input("  private key path: ").strip()
            if v:
                cfg["private_key_path"] = v
                save_config(cfg)
                print("  saved")
        elif c == "3":
            v = input("  log path: ").strip()
            if v:
                cfg["log_path"] = v
                save_config(cfg)
                print("  saved")
        elif c == "4":
            v = input("  days (0 = keep forever): ").strip()
            if v.isdigit():
                cfg["session_cache_days"] = int(v)
                save_config(cfg)
                print("  saved")
        elif c == "5":
            v = input("  library dir: ").strip()
            if v:
                cfg["library_dir"] = v
                save_config(cfg)
                print("  saved")
        elif c in ("b", "q", ""):
            return cfg


def tui() -> None:
    cfg = load_config()
    while True:
        print(MENU.format(line="\N{BOX DRAWINGS LIGHT HORIZONTAL}" * 42))
        c = input("> ").strip().lower()
        if c == "1":
            tui_decrypt(cfg)
        elif c == "2":
            tui_log(cfg)
        elif c == "3":
            cfg = tui_settings(cfg)
        elif c == "4":
            tui_browse(cfg)
        elif c == "5":
            cmd_library(cfg)
        elif c == "6":
            cmd_setup()
        elif c in ("q", ""):
            return


# ----------------------------------------------------------------------------
# self-test
# ----------------------------------------------------------------------------

def mrb2_encrypt_for_test(payload: bytes, pub_pem: str) -> str:
    """Mirror of export-session.py's encryptor (interop check)."""
    import secrets as _secrets
    key = _secrets.token_bytes(32)
    iv = _secrets.token_bytes(16)
    enc = subprocess.run(
        [find_openssl(), "enc", "-aes-256-cbc", "-K", key.hex(), "-iv", iv.hex()],
        input=payload, capture_output=True, check=True).stdout
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pem", mode="w") as tf:
        tf.write(pub_pem)
        pubpath = tf.name
    try:
        wrap = subprocess.run(
            [find_openssl(), "pkeyutl", "-encrypt", "-pubin", "-inkey", pubpath,
             "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
            input=key, capture_output=True, check=True).stdout
    finally:
        os.unlink(pubpath)
    b = base64.b64encode
    return f"MRB2.{b(wrap).decode()}.{b(iv).decode()}.{b(enc).decode()}"


def self_test() -> bool:
    openssl = find_openssl()
    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        priv, pub = tdir / "k.pem", tdir / "k.pub.pem"
        subprocess.run([openssl, "genpkey", "-algorithm", "RSA",
                        "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(priv)],
                       capture_output=True, check=True)
        subprocess.run([openssl, "pkey", "-in", str(priv), "-pubout",
                        "-out", str(pub)], capture_output=True, check=True)
        pub_pem = pub.read_text()

        # --- MRB1 legacy round-trip
        url = "https://worker.example/s/selftest01"
        ct = subprocess.run(
            [openssl, "pkeyutl", "-encrypt", "-pubin", "-inkey", str(pub),
             "-pkeyopt", "rsa_padding_mode:oaep",
             "-pkeyopt", "rsa_oaep_md:sha256"],
            input=url.encode(), capture_output=True, check=True).stdout
        blob = base64.b64encode(ct).decode()
        got = openssl_decrypt(openssl, priv, ct)
        assert got.decode() == url, "MRB1 round-trip mismatch"
        pasted = f"~ [share link encrypted] MRB1.{blob}\ncontext: test/repo | PR #1"
        b, ctx = parse_input(pasted)
        assert b == blob and ctx == "test/repo | PR #1", "parse mismatch"

        # --- MRB2 round-trip, new osh-passive payload shape (interop with
        # export-session.py's encryptor)
        payload = {"format": "osh-passive", "v": 2, "repo": "t/r", "run_id": "42",
                   "session_id": "ses_TEST", "ts": "2026-11-01T00:00:00Z",
                   "live": {"id": "ab", "url": "https://w/s/ab", "status": "completed",
                            "gated": True},
                   "snapshot": "offline",
                   "exports": {"ses_TEST": {"info": {"id": "ses_TEST"},
                                            "messages": [{"info": {"id": "m1"}}]},
                               "ses_CHILD": {"info": {"id": "ses_CHILD",
                                                      "parentID": "ses_TEST"}}},
                   "snapshot_html": "<!doctype html><title>snap</title>"}
        wire = mrb2_encrypt_for_test(gzip.compress(json.dumps(payload).encode()), pub_pem)
        m = BLOB2_RE.search(wire)
        assert m, "MRB2 wire regex mismatch"
        out = decrypt_mrb2(m, priv)
        assert out["format"] == "osh-passive" and out["session_id"] == "ses_TEST"
        assert set(out["exports"]) == {"ses_TEST", "ses_CHILD"}, "payload corruption"

        # --- library write smoke (sandboxed cfg)
        cfg = dict(DEFAULTS)
        cfg["library_dir"] = str(tdir / "lib")
        entry, snap = library_write(cfg, out)
        assert snap and snap.exists(), "snapshot not written"
        assert (entry / "meta.json").exists()
        assert (entry / "exports" / "ses_TEST.json").exists()
        assert (entry / "exports" / "ses_CHILD.json").exists()
        assert "snap" in snap.read_text(encoding="utf-8")

        # --- legacy items-only payload still lands honestly (no render)
        legacy = {"v": 2, "kind": "session", "repo": "t/r", "run_id": "41",
                  "session_id": "ses_OLD", "data": [{"type": "session",
                                                     "data": {"id": "ses_OLD"}}]}
        wire2 = mrb2_encrypt_for_test(gzip.compress(json.dumps(legacy).encode()), pub_pem)
        out2 = decrypt_mrb2(BLOB2_RE.search(wire2), priv)
        entry2, snap2 = library_write(cfg, out2)
        assert snap2 is None and (entry2 / "items.json").exists(), \
            "legacy payload handling"

        # --- meta payload parse (fields the summary blob carries)
        meta = {"v": 2, "kind": "meta", "repo": "t/r", "run_id": "42",
                "session_id": "ses_TEST", "artifact": "session-42.enc",
                "url": "https://w/s/ab", "share_id": "ab",
                "share_status": "completed", "share_gated": True,
                "snapshot": "online"}
        wire3 = mrb2_encrypt_for_test(json.dumps(meta).encode(), pub_pem)
        out3 = decrypt_mrb2(BLOB2_RE.search(wire3), priv)
        assert out3["share_id"] == "ab" and out3["share_gated"] is True

        print("self-test: OK (MRB1 round-trip, MRB2 osh-passive round-trip "
              "+ interop, library write, legacy payload, meta payload)")
        return True


# ----------------------------------------------------------------------------
# entry
# ----------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return 0 if self_test() else 1
    # --file <path>: read input (e.g. a downloaded session-*.enc artifact)
    # from a file instead of argv (large artifacts exceed arg limits).
    if argv[1:3] and argv[1] == "--file":
        path = Path(argv[2])
        if not path.exists():
            print(f"file not found: {path}")
            return 1
        ok = decrypt_flow(path.read_text(encoding="utf-8", errors="replace"),
                          load_config(), "--open" in argv)
        return 0 if ok else 1
    args = [a for a in argv[1:] if a != "--open"]
    want_open = "--open" in argv
    if args and args[0] == "setup":
        return cmd_setup()
    if args and args[0] == "library":
        cmd_library(load_config())
        return 0
    if args and args[0] == "config":
        cfg = load_config()
        if len(args) >= 2 and args[1] == "set" and len(args) == 4:
            key, value = args[2], args[3]
            if key not in DEFAULTS:
                print(f"unknown key: {key} (valid: {', '.join(DEFAULTS)})")
                return 1
            if key == "persist":
                value = value.lower() in ("1", "true", "on", "yes")
            elif key == "session_cache_days":
                value = int(value)
            cfg[key] = value
            save_config(cfg)
            print(f"saved {key} = {value} -> {CONFIG_PATH}")
            return 0
        print(json.dumps(cfg, indent=2))
        return 0
    if args:
        ok = decrypt_flow(" ".join(args), load_config(), want_open)
        return 0 if ok else 1
    tui()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
