#!/usr/bin/env python3
"""Mirrobot share-link decryptor + session viewer.

Upstream opencode discontinued share links; the platform now produces
encrypted session artifacts (MRB2) plus, optionally, live share URLs on
our own worker. This tool decrypts both and renders sessions locally.

Wire formats:
  MRB1.<b64>                    legacy: RSA-OAEP(share URL)
  MRB2.<b64>.<b64>.<b64>        new: RSA-OAEP(AES key) . iv . AES-256-CBC
                               payload (gzipped JSON). kind=meta points
                               at the Actions artifact (auto-fetched via
                               gh); kind=session carries the full share
                               Data[] snapshot; kind=meta may carry a
                               live worker URL (opened directly).

Usage:
  python decrypt_share_link.py                 # interactive TUI
  python decrypt_share_link.py "<pasted text>" # one-shot decrypt
  python decrypt_share_link.py "<blob>" --open # decrypt + open browser
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
  session_cache_days (default 30; cached session HTML files older than
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
from datetime import datetime, timezone
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
        sys.exit("error: openssl not found on PATH (install Git for Windows / openssl)")
    return exe


def openssl_decrypt(openssl: str, key: Path, ciphertext: bytes) -> bytes:
    proc = subprocess.run(
        [openssl, "pkeyutl", "-decrypt", "-inkey", str(key),
         "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
        input=ciphertext, capture_output=True,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"openssl decrypt failed: {err}")
    return proc.stdout


def openssl_aes_decrypt(aes_key: bytes, iv: bytes, ct: bytes) -> bytes:
    proc = subprocess.run(
        [find_openssl(), "enc", "-d", "-aes-256-cbc",
         "-K", aes_key.hex(), "-iv", iv.hex()],
        input=ct, capture_output=True,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"aes decrypt failed: {err}")
    return proc.stdout


def maybe_gunzip(data: bytes) -> bytes:
    return gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data


def decrypt_mrb2(m: re.Match, key_path: Path) -> dict:
    """MRB2.<rsakey>.<iv>.<ct> -> decrypted JSON payload dict."""
    wrapped, iv, ct = (base64.b64decode(m.group(i), validate=True) for i in (1, 2, 3))
    aes_key = openssl_decrypt(find_openssl(), key_path, wrapped)
    if len(aes_key) != 32:
        raise RuntimeError("unwrapped key is not 32 bytes")
    plain = maybe_gunzip(openssl_aes_decrypt(aes_key, iv, ct))
    return json.loads(plain.decode("utf-8"))


def decrypt_blob(blob_b64: str, key_path: Path) -> str:
    """Legacy MRB1: RSA-OAEP(share URL)."""
    ciphertext = base64.b64decode(blob_b64, validate=True)
    plaintext = openssl_decrypt(find_openssl(), key_path, ciphertext)
    url = plaintext.decode("utf-8", errors="strict")
    if not re.fullmatch(r"https://[A-Za-z0-9._/-]+", url):
        raise RuntimeError(f"decrypted value is not a URL: {url!r}")
    return url


# ----------------------------------------------------------------------------
# parsing / persistence
# ----------------------------------------------------------------------------

def parse_input(text: str) -> tuple[str | None, str | None]:
    m = BLOB_RE.search(text)
    blob = m.group(1) if m else None
    c = CTX_RE.search(text)
    ctx = c.group(1).strip() if c else None
    return blob, ctx


def append_log(cfg: dict, line: str, ctx: str | None) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "url": line,
        "context": ctx or "",
    }
    log = Path(cfg["log_path"])
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------------------
# gh / GitHub API helpers
# ----------------------------------------------------------------------------

def find_gh() -> str | None:
    return shutil.which("gh")


def gh_repo(gh: str) -> str | None:
    try:
        p = subprocess.run([gh, "repo", "view", "--json", "nameWithOwner",
                            "--jq", ".nameWithOwner"],
                           capture_output=True, text=True, timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except Exception:
        pass
    return None


def gh_token(gh: str) -> str | None:
    try:
        p = subprocess.run([gh, "auth", "token"], capture_output=True,
                           text=True, timeout=30)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except Exception:
        pass
    return os.environ.get("GITHUB_TOKEN")


def api_get(url: str, token: str | None) -> bytes:
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "mirrobot-decryptor",
        **({"Authorization": f"Bearer {token}"} if token else {}),
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def fetch_artifact_enc(repo: str, run_id: str, name: str, token: str | None) -> bytes:
    """Download an Actions artifact by name; return the .enc file bytes."""
    data = json.loads(api_get(
        f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts",
        token))
    art = next((a for a in data.get("artifacts", []) if a.get("name") == name), None)
    if not art:
        avail = [a.get("name") for a in data.get("artifacts", [])]
        raise RuntimeError(f"artifact {name} not found on run {run_id} (have: {avail})")
    raw = api_get(
        f"https://api.github.com/repos/{repo}/actions/artifacts/{art['id']}/zip",
        token)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        for zn in zf.namelist():
            if zn.endswith(".enc"):
                return zf.read(zn)
    raise RuntimeError(f"no .enc file inside artifact {name}")


# ----------------------------------------------------------------------------
# renderer: share Data[] -> self-contained HTML
# ----------------------------------------------------------------------------

def msg_time(info: dict) -> int:
    """Robust message timestamp: v1 = {created: <ms int>, completed?: <ms int>}."""
    t = info.get("time") or {}
    if isinstance(t, dict):
        for k in ("completed", "created"):
            v = t.get(k)
            if isinstance(v, (int, float)):
                return int(v)
            if isinstance(v, dict):
                vv = v.get("completed") or v.get("start")
                if isinstance(vv, (int, float)):
                    return int(vv)
    if isinstance(t, (int, float)):
        return int(t)
    return 0


def fold_data(data: list[dict]) -> dict:
    """Data[] -> {session, models, messages: [{info, parts[]}]} (pure fold)."""
    session = None
    models: list = []
    messages: dict = {}
    for item in data or []:
        t, d = item.get("type"), item.get("data")
        if t == "session":
            session = d
        elif t == "model":
            models = d if isinstance(d, list) else [d]
        elif t == "message":
            messages[d.get("id")] = {"info": d, "parts": []}
        elif t == "part":
            key = d.get("messageID")
            if key in messages:
                messages[key]["parts"].append(d)
            else:
                messages.setdefault(key, {"info": {"id": key, "role": "?"}, "parts": []})
                messages[key]["parts"].append(d)
    ordered = sorted(messages.values(), key=lambda m: msg_time(m["info"]))
    return {"session": session, "models": models, "messages": ordered}


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#0f1115;--fg:#d7dae0;--dim:#8b93a1;--line:#232732;--user:#1c2333;
--accent:#7aa2f7;--ok:#9ece6a;--warn:#e0af68;--err:#f7768e;--code:#161a23}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.55 ui-monospace,'Cascadia Code',Consolas,monospace}
.wrap{max-width:980px;margin:0 auto;padding:24px 20px 80px}
header{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px}
header h1{font-size:15px;margin:0 0 6px;font-weight:600;color:var(--accent);word-break:break-word}
header .meta{color:var(--dim);font-size:12px}
.msg{border:1px solid var(--line);border-radius:8px;margin:14px 0;overflow:hidden}
.msg.user{background:var(--user)}
.msg .role{padding:7px 12px;font-size:11px;letter-spacing:.08em;color:var(--dim);
border-bottom:1px solid var(--line);display:flex;gap:10px;justify-content:space-between}
.msg .role .m{letter-spacing:0}
.part{padding:10px 14px;border-bottom:1px solid var(--line)}
.part:last-child{border-bottom:0}
.part.text{white-space:pre-wrap;word-break:break-word}
.part.reasoning{color:var(--dim);background:rgba(255,255,255,.02)}
.part.tool .t-head{cursor:pointer;user-select:none;color:var(--warn)}
.part.tool .t-body{margin-top:8px;background:var(--code);border-radius:6px;
padding:10px;white-space:pre-wrap;word-break:break-word;font-size:12.5px;
max-height:420px;overflow:auto}
.state-ok{color:var(--ok)} .state-err{color:var(--err)}
details.part{padding:6px 14px}
details.part summary{cursor:pointer;color:var(--dim);font-size:12px}
footer{margin-top:26px;color:var(--dim);font-size:11px;border-top:1px solid var(--line);padding-top:10px}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>__TITLE__</h1>
<div class="meta">__META__</div>
</header>
<div id="app">rendering…</div>
<footer>mirrobot session archive &middot; decrypted locally &middot; __FOOT__</footer>
</div>
<script type="application/json" id="snapshot">__DATA__</script>
<script>
const SNAPSHOT = JSON.parse(document.getElementById('snapshot').textContent);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = t => { try {
  const ms = t?.completed || t?.created?.completed || t?.created || t;
  if (!ms) return '';
  return new Date(typeof ms === 'number' ? ms : Date.parse(ms)).toLocaleString();
} catch { return '' } };

function renderPart(p) {
  if (p.type === 'text')
    return '<div class="part text">' + esc(p.text) + '</div>';
  if (p.type === 'reasoning')
    return '<details class="part reasoning" open><summary>reasoning</summary><div class="text">'
      + esc(p.text) + '</div></details>';
  if (p.type === 'tool') {
    const st = p.state?.status || 'pending';
    const cls = st === 'error' ? 'state-err' : (st === 'completed' ? 'state-ok' : '');
    let body = '';
    const t = p.state?.tool ?? p.tool;
    if (t) body += esc(t) + '\\n';
    if (p.state?.input != null) body += '\\n input:\\n' + esc(typeof p.state.input === 'string'
      ? p.state.input : JSON.stringify(p.state.input, null, 1));
    const out = p.state?.output ?? p.output;
    if (out != null) body += '\\n output:\\n' + esc(typeof out === 'string'
      ? out : JSON.stringify(out, null, 1)).slice(0, 20000);
    if (st === 'error' && p.state?.error) body += '\\n error: ' + esc(p.state.error);
    return '<details class="part tool"><summary class="t-head">' + esc(t || 'tool')
      + ' <span class="' + cls + '">[' + esc(st) + ']</span></summary>'
      + '<div class="t-body">' + (body || '(empty)') + '</div></details>';
  }
  if (p.type === 'step-start') return '';
  if (p.type === 'step-finish') return '';
  return '<details class="part"><summary>' + esc(p.type) + '</summary><div class="text">'
    + esc(JSON.stringify(p, null, 1)) + '</div></details>';
}

function render() {
  const app = document.getElementById('app');
  const msgs = SNAPSHOT.messages || [];
  app.innerHTML = msgs.map(m => {
    const info = m.info || {};
    const role = info.role || '?';
    const right = [];
    const model = info.model;
    if (model) right.push(esc(typeof model === 'string' ? model
      : (model.modelID ? ((model.providerID || '') + '/' + model.modelID) : JSON.stringify(model))));
    const ts = when(info.time);
    if (ts) right.push(esc(ts));
    if (role === 'assistant' && info.cost != null) {
      const c = info.cost / 1e6;
      right.push('$' + c.toFixed(c >= 1 ? 2 : 4));
    }
    const parts = (m.parts || []).map(renderPart).filter(Boolean).join('');
    return '<div class="msg ' + esc(role) + '"><div class="role"><span>'
      + esc(role).toUpperCase() + '</span><span class="m">' + right.join(' &middot; ')
      + '</span></div>' + (parts || '<div class="part text" style="color:var(--dim)">(no content)</div>')
      + '</div>';
  }).join('') || '<div class="part text">empty session</div>';
}
render();
</script>
</body>
</html>
"""


def render_session_html(payload: dict) -> str:
    folded = fold_data(payload.get("data") or [])
    session = folded.get("session") or {}
    title = session.get("title") or payload.get("session_id") or "session"
    meta_bits = [payload.get("repo", ""), f"run {payload.get('run_id', '?')}",
                 payload.get("session_id", ""), payload.get("ts", "")]
    html = HTML_TEMPLATE
    html = html.replace("__TITLE__", f"{title} — mirrobot session")
    html = html.replace("__META__", esc_html(" · ".join(x for x in meta_bits if x)))
    html = html.replace("__FOOT__", esc_html(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")))
    blob = json.dumps({"session": folded["session"], "messages": folded["messages"]},
                      ensure_ascii=False).replace("</", "<\\/")
    html = html.replace("__DATA__", blob)
    return html


def esc_html(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def library_write(cfg: dict, payload: dict, html: str) -> Path:
    lib = Path(cfg["library_dir"])
    lib.mkdir(parents=True, exist_ok=True)
    sid = payload.get("session_id") or f"run-{payload.get('run_id', 'x')}"
    page = lib / f"{sid}.html"
    page.write_text(html, encoding="utf-8")
    # Evict expired cache entries (0 = keep forever).
    days = int(cfg.get("session_cache_days") or 0)
    if days > 0:
        cutoff = time.time() - days * 86400
        for f in lib.glob("*.html"):
            if f.name != "index.html" and f.stat().st_mtime < cutoff:
                f.unlink()
    # Refresh the index page (static library browser).
    rows = []
    for f in sorted(lib.glob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.name == "index.html":
            continue
        rows.append(
            f'<div><a href="{f.name}">{f.stem}</a>'
            f'<span class="d">{datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")}</span></div>'
        )
    index = (
        "<!doctype html><html><head><meta charset='utf-8'><title>mirrobot sessions</title>"
        "<style>body{background:#0f1115;color:#d7dae0;font:14px ui-monospace,Consolas,monospace;"
        "max-width:720px;margin:40px auto;padding:0 16px}a{color:#7aa2f7;text-decoration:none}"
        "div{padding:8px 0;border-bottom:1px solid #232732}.d{color:#8b93a1;float:right;font-size:12px}"
        "h1{font-size:16px;color:#7aa2f7}</style></head><body>"
        f"<h1>mirrobot sessions</h1>{''.join(rows) or '<div>no cached sessions yet</div>'}</body></html>"
    )
    (lib / "index.html").write_text(index, encoding="utf-8")
    return page


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

    kind = payload.get("kind")
    if kind == "session":
        html = render_session_html(payload)
        page = library_write(cfg, payload, html)
        url = page_url(page)
        if open_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        show_result(url, f"session {payload.get('session_id', '?')} | "
                         f"{payload.get('repo', '?')} | run {payload.get('run_id', '?')}",
                    open_browser)
        if cfg.get("persist"):
            append_log(cfg, url, payload.get("repo"))
        return True

    if kind == "meta":
        live = payload.get("url")
        artifact = payload.get("artifact")
        if live:
            if open_browser:
                try:
                    webbrowser.open(live)
                except Exception:
                    pass
            show_result(live, f"live share | {payload.get('repo', '?')} | "
                              f"run {payload.get('run_id', '?')}", open_browser)
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
  3. Add it as the repo secret SHARE_LINK_PUBKEY:
       Settings -> Secrets and variables -> Actions -> New repository secret
       (or:  gh secret set SHARE_LINK_PUBKEY --repo OWNER/REPO < pub.pem )
"""


def cmd_setup() -> int:
    cfg = load_config()
    openssl = find_openssl()
    key = Path(cfg["private_key_path"])

    if key.exists():
        print(f"  private key already exists: {key}")
    else:
        key.parent.mkdir(parents=True, exist_ok=True)
        print(f"  generating new keypair at {key} ...")
        subprocess.run([openssl, "genpkey", "-algorithm", "RSA",
                        "-pkeyopt", "rsa_keygen_bits:2048",
                        "-out", str(key)], check=True)
        try:
            key.chmod(0o600)
        except OSError:
            pass
        print("  generated.")
    pub_pem = subprocess.run([openssl, "pkey", "-in", str(key), "-pubout"],
                             capture_output=True, text=True, check=True).stdout

    gh = find_gh()
    repo = gh_repo(gh) if gh else None
    if not repo:
        print("\n" + SETUP_STEPS)
        print(f"  Your public key (also needed for step 3):\n")
        print(pub_pem)
        return 0

    lst = subprocess.run([gh, "secret", "list", "--repo", repo, "--json",
                          "name"], capture_output=True, text=True)
    have = False
    try:
        have = any(s.get("name") == "SHARE_LINK_PUBKEY"
                   for s in json.loads(lst.stdout or "[]"))
    except json.JSONDecodeError:
        pass
    if have:
        print(f"  secret SHARE_LINK_PUBKEY already set on {repo} (left untouched)")
    else:
        p = subprocess.run([gh, "secret", "set", "SHARE_LINK_PUBKEY",
                            "--repo", repo], input=pub_pem,
                            capture_output=True, text=True)
        if p.returncode == 0:
            print(f"  secret SHARE_LINK_PUBKEY pushed to {repo}")
        else:
            print(f"  could not set secret: {p.stderr.strip()}")
            print(SETUP_STEPS)
            return 1
    print("  setup complete.")
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
        choice = input("[o] open in browser, [Enter] next: ").strip().lower()
        if choice == "o":
            last = None
            print("  (use the printed link)")


def cmd_library(cfg: dict) -> None:
    lib = Path(cfg["library_dir"])
    if not lib.exists():
        print("no session library yet (nothing decrypted)")
        return
    for f in sorted(lib.glob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True):
        print(f"  {datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y-%m-%d %H:%M')}  "
              f"{f.stem:40}  {page_url(f)}")
    print(f"\n  library index: {page_url(lib / 'index.html')}")


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

        # --- MRB2 round-trip: encrypt (export-session mirror) -> decrypt (tool)
        payload = {"v": 2, "kind": "session", "repo": "t/r", "run_id": "1",
                   "session_id": "ses_TEST", "ts": "2026-10-16T00:00:00Z",
                   "data": [
                       {"type": "session", "data": {"id": "ses_TEST", "title": "t"}},
                       {"type": "message", "data": {"id": "msg_1", "role": "user",
                        "time": {"created": {"completed": 1}}}},
                       {"type": "message", "data": {"id": "msg_2", "role": "assistant",
                        "time": {"created": {"completed": 2}}, "model": "m/x"}},
                       {"type": "part", "data": {"id": "p1", "messageID": "msg_1",
                        "type": "text", "text": "hello"}},
                       {"type": "part", "data": {"id": "p2", "messageID": "msg_2",
                        "type": "tool", "state": {"status": "completed",
                        "tool": "bash", "output": "ok"}}},
                   ]}
        wire = mrb2_encrypt_for_test(gzip.compress(json.dumps(payload).encode()), pub_pem)
        m = BLOB2_RE.search(wire)
        assert m, "MRB2 wire regex mismatch"
        out = decrypt_mrb2(m, priv)
        assert out["kind"] == "session" and out["session_id"] == "ses_TEST"
        assert len(out["data"]) == 5, "MRB2 payload corruption"

        # --- fold + render smoke
        folded = fold_data(out["data"])
        assert [mi["info"]["id"] for mi in folded["messages"]] == ["msg_1", "msg_2"]
        assert folded["messages"][1]["parts"][0]["state"]["tool"] == "bash"
        html = render_session_html(out)
        assert "ses_TEST" in html and "hello" in html and "bash" in html
        # The embedded snapshot must survive the HTML round-trip: extract
        # the JSON block back out of the page and parse it.
        m_snap = re.search(
            r'<script type="application/json" id="snapshot">(.*?)</script>',
            html, re.DOTALL)
        assert m_snap, "snapshot block missing"
        embedded = json.loads(m_snap.group(1).replace("<\\/", "</"))
        assert embedded["messages"][0]["info"]["id"] == "msg_1"

        # --- library write smoke (sandboxed cfg)
        cfg = dict(DEFAULTS)
        cfg["library_dir"] = str(tdir / "lib")
        page = library_write(cfg, out, html)
        assert page.exists() and (tdir / "lib" / "index.html").exists()

        print("self-test: OK (MRB1 round-trip, MRB2 round-trip + interop, "
              "fold, render, library)")
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
        rest = [a for a in argv[3:] if a != "--open"]
        return 0 if decrypt_flow(path.read_text(encoding="utf-8", errors="replace"),
                                 load_config(), "--open" in argv) else 0 if rest else 1
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
        return 0 if decrypt_flow(" ".join(args), load_config(), want_open) else 1
    tui()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
