"""Shared configuration for the detection-as-code CI scripts.

Every value is read from the environment so nothing sensitive is committed. For
local runs, drop a `.env` file at the repo root (see `.env.example`); it is
gitignored and loaded automatically here — no python-dotenv dependency required.

Defaults target a Wazuh all-in-one reachable on loopback with self-signed TLS,
which is the lab topology in docs/PLAN.md. Override per environment.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

# --- repo layout ------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = REPO_ROOT / "tests" / "samples"
MANIFEST_PATH = SAMPLES_DIR / "manifest.json"
WAZUH_RULES_PATH = REPO_ROOT / "rules" / "wazuh" / "local_rules.xml"
SIGMA_DIR = REPO_ROOT / "rules" / "sigma"


def _load_dotenv() -> None:
    """Populate os.environ from a repo-root .env file, if present.

    Minimal parser: `KEY=VALUE` per line, `#` comments, optional surrounding
    quotes. Existing environment variables always win over the file.
    """
    env_file = REPO_ROOT / ".env"
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv()


def _bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


# --- Wazuh manager API (unit test: /logtest, port 55000) --------------------
MANAGER_URL = os.environ.get("WAZUH_MANAGER_URL", "https://127.0.0.1:55000").rstrip("/")
MANAGER_USER = os.environ.get("WAZUH_API_USER", "wazuh-wui")
MANAGER_PASSWORD = os.environ.get("WAZUH_API_PASSWORD", "")

# --- Wazuh indexer API (integration test: _search, port 9200) ---------------
INDEXER_URL = os.environ.get("WAZUH_INDEXER_URL", "https://127.0.0.1:9200").rstrip("/")
INDEXER_USER = os.environ.get("WAZUH_INDEXER_USER", "admin")
INDEXER_PASSWORD = os.environ.get("WAZUH_INDEXER_PASSWORD", "")
ALERTS_INDEX = os.environ.get("WAZUH_ALERTS_INDEX", "wazuh-alerts-*")

# --- TLS ---------------------------------------------------------------------
# Lab uses self-signed certs; default to not verifying. Set WAZUH_VERIFY_TLS=true
# and WAZUH_CA_BUNDLE=/path/to/ca.pem to verify properly in a hardened setup.
VERIFY_TLS = _bool("WAZUH_VERIFY_TLS", False)
CA_BUNDLE = os.environ.get("WAZUH_CA_BUNDLE", "")

# requests' `verify` accepts True/False or a CA-bundle path.
REQUESTS_VERIFY = CA_BUNDLE if (VERIFY_TLS and CA_BUNDLE) else VERIFY_TLS


def load_manifest() -> dict:
    """Return the parsed tests/samples/manifest.json."""
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def manifest_cases() -> list[dict]:
    return load_manifest()["cases"]
