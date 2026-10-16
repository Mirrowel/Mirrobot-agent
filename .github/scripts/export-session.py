#!/usr/bin/env python3
"""export-session.py — Mirrobot session artifact builder (runs on the CI runner).

Upstream opencode discontinued share links. This is the passive half of the
replacement: after a headless `opencode run` completes, it

  1. finds the session the run just wrote (the runner is single-purpose:
     newest session in the opencode SQLite DB),
  2. exports it (`opencode export <id>` — official, DB-backed),
  3. normalizes the v1 export shape {info, messages:[{info, parts[]}]} into
     the share Data[] snapshot model (session/message/part items, the same
     items the live plugin streams and the viewer renders — ONE data
     contract for live and archived),
  4. gzips + encrypts it (AES-256-CBC payload, RSA-OAEP-wrapped key — the
     same hybrid scheme and SHARE_LINK_PUBKEY as MRB1, new MRB2 wire
     format), writing:
       <out-dir>/session-<runid>.enc  — the artifact to upload
       <out-dir>/session-meta.txt     — MRB2 metadata line + context line
                                        for the run summary

Usage:
  export-session.py [--out-dir /tmp] [--run-id 123] [--repo OWNER/REPO]
                    [--db ~/.local/share/opencode/opencode.db]
                    [--live-url https://...] [--opencode <path>]

Environment:
  SHARE_LINK_PUBKEY  PEM public key (CI secret; required for encryption)
  GITHUB_REPOSITORY  used for --repo fallback
  GITHUB_RUN_ID      used for --run-id fallback

Requires: python3 (stdlib only) + openssl + opencode on PATH.
The artifact is decryptable by decrypt_share_link.py (MRB2).
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import secrets
import subprocess
import sys
import shutil
from pathlib import Path

WIRE_PREFIX = "MRB2"


# ----------------------------------------------------------------------------
# MRB2 hybrid encryption (openssl subprocess; no third-party deps)
# ----------------------------------------------------------------------------

def openssl() -> str:
    exe = shutil.which("openssl")
    if not exe:
        sys.exit("error: openssl not found on PATH")
    return exe


def mrb2_encrypt(payload: bytes, pub_pem: str) -> str:
    """AES-256-CBC(payload) with RSA-OAEP(SHA-256)-wrapped key.

    Wire format: MRB2.<b64(rsakey)>.<b64(iv)>.<b64(ct)>
    """
    key = secrets.token_bytes(32)
    iv = secrets.token_bytes(16)
    enc = subprocess.run(
        [openssl(), "enc", "-aes-256-cbc", "-K", key.hex(), "-iv", iv.hex()],
        input=payload, capture_output=True,
    )
    if enc.returncode != 0:
        sys.exit(f"error: aes encrypt failed: {enc.stderr.decode(errors='replace').strip()}")
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as tf:
        tf.write(pub_pem.encode() if isinstance(pub_pem, str) else pub_pem)
        pubpath = tf.name
    try:
        wrap = subprocess.run(
            [openssl(), "pkeyutl", "-encrypt", "-pubin", "-inkey", pubpath,
             "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
            input=key, capture_output=True,
        )
    finally:
        os.unlink(pubpath)
    if wrap.returncode != 0:
        sys.exit(f"error: rsa wrap failed: {wrap.stderr.decode(errors='replace').strip()}")
    b = base64.b64encode
    return f"{WIRE_PREFIX}.{b(wrap.stdout).decode()}.{b(iv).decode()}.{b(enc.stdout).decode()}"


# ----------------------------------------------------------------------------
# session discovery + export
# ----------------------------------------------------------------------------

def find_db(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if not p.exists():
            sys.exit(f"error: db not found: {p}")
        return p
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    p = Path(base) / "opencode" / "opencode.db"
    if not p.exists():
        sys.exit(f"error: opencode db not found at {p} (pass --db)")
    return p


def newest_session_id(db: Path) -> str:
    import sqlite3
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        row = con.execute(
            "SELECT id FROM session ORDER BY time_updated DESC LIMIT 1"
        ).fetchone()
    finally:
        con.close()
    if not row or not row[0]:
        sys.exit("error: no sessions found in the opencode db")
    return str(row[0])


def opencode_export(session_id: str, exe: str) -> dict:
    cmd = [exe] if exe else ["opencode"]
    cmd += ["export", session_id]
    # Capture BYTES + decode UTF-8 explicitly: text=True uses the locale
    # codec on Windows (cp1251 etc.) and dies on non-ASCII session content,
    # leaving stdout as None mid-read (live-caught).
    p = subprocess.run(cmd, capture_output=True, timeout=300)
    if p.returncode != 0:
        sys.exit(f"error: opencode export failed: "
                 f"{p.stderr.decode('utf-8', errors='replace').strip()[:400]}")
    raw = p.stdout.decode("utf-8", errors="replace")
    i = raw.find("{")
    if i < 0:
        sys.exit("error: export produced no JSON")
    try:
        return json.loads(raw[i:])
    except json.JSONDecodeError as exc:
        sys.exit(f"error: export JSON parse failed: {exc}")


# ----------------------------------------------------------------------------
# v1 export -> share Data[] normalization (ONE data contract for everything)
# ----------------------------------------------------------------------------

def export_to_data(export: dict) -> list[dict]:
    """v1 {info, messages:[{info, parts[]}]} -> [{type, data}] items.

    Item shapes match upstream ShareNext exactly: session = SessionInfo,
    message = Message info, part = full Part. Models are derived from user
    messages (provider resolution stays viewer-side).
    """
    items: list[dict] = []
    info = export.get("info")
    if info:
        items.append({"type": "session", "data": info})
    models: list[str] = []
    for m in export.get("messages") or []:
        minfo = m.get("info") or {}
        items.append({"type": "message", "data": minfo})
        model = minfo.get("model")
        if model and model not in models:
            models.append(model)
        for part in m.get("parts") or []:
            items.append({"type": "part", "data": part})
    if models:
        items.append({"type": "model", "data": models})
    return items


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default="/tmp")
    ap.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", "local"))
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "unknown/repo"))
    ap.add_argument("--db", default=None)
    ap.add_argument("--live-url", default=None,
                    help="live share URL from the plugin (folded into the meta blob)")
    ap.add_argument("--opencode", default=None)
    ap.add_argument("--plain", action="store_true",
                    help="debug: also write the unencrypted normalized JSON")
    args = ap.parse_args(argv[1:])

    pub = os.environ.get("SHARE_LINK_PUBKEY", "").strip()
    if not pub:
        sys.exit("error: SHARE_LINK_PUBKEY not set (repo secret)")

    db = find_db(args.db)
    sid = newest_session_id(db)
    print(f"session: {sid} (newest in {db})")

    export = opencode_export(sid, args.opencode)
    data = export_to_data(export)
    n_parts = sum(1 for i in data if i["type"] == "part")
    n_msgs = sum(1 for i in data if i["type"] == "message")
    print(f"normalized: {n_msgs} messages, {n_parts} parts")

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    session_payload = json.dumps({
        "v": 2,
        "kind": "session",
        "repo": args.repo,
        "run_id": str(args.run_id),
        "session_id": sid,
        "ts": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "data": data,
    }, ensure_ascii=False).encode("utf-8")

    blob = mrb2_encrypt(gzip.compress(session_payload), pub)
    art = out / f"session-{args.run_id}.enc"
    art.write_text(blob + "\n", encoding="utf-8")
    print(f"artifact: {art} ({art.stat().st_size} bytes encrypted)")

    meta_payload = json.dumps({
        "v": 2,
        "kind": "meta",
        "repo": args.repo,
        "run_id": str(args.run_id),
        "session_id": sid,
        "artifact": art.name,
        **({"url": args.live_url} if args.live_url else {}),
    }, ensure_ascii=False).encode("utf-8")
    meta_blob = mrb2_encrypt(meta_payload, pub)
    meta = out / "session-meta.txt"
    meta.write_text(
        f"session artifact (MRB2, decrypt with decrypt_share_link.py):\n"
        f"MRB2 encrypted: {meta_blob}\n"
        f"artifact: {art.name}\n",
        encoding="utf-8",
    )
    print(f"meta: {meta}")

    if args.plain:
        plain = out / f"session-{args.run_id}.data.json"
        plain.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"debug plain: {plain}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
