"""Thin clients for the two Wazuh APIs the pipeline uses.

  WazuhManager  -> manager API on 55000: JWT auth + /logtest (unit test).
  WazuhIndexer  -> indexer API on 9200: basic auth + _search (integration test).

Kept dependency-light (requests only) and free of any print/exit so the callers
own their own output and exit codes.
"""
from __future__ import annotations

import urllib3
import requests

import config

# Lab certs are self-signed; silence the noise only when the operator opted out
# of verification (config.REQUESTS_VERIFY is False).
if not config.REQUESTS_VERIFY:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class WazuhError(RuntimeError):
    """Any non-recoverable failure talking to a Wazuh API."""


class WazuhManager:
    """Wazuh manager API client (port 55000)."""

    def __init__(self, url: str, user: str, password: str, verify=None, timeout: int = 30):
        self.url = url.rstrip("/")
        self.user = user
        self.password = password
        self.verify = config.REQUESTS_VERIFY if verify is None else verify
        self.timeout = timeout
        self._token: str | None = None

    def authenticate(self) -> str:
        """Obtain a JWT from POST /security/user/authenticate."""
        if not self.password:
            raise WazuhError(
                "No manager password set. Export WAZUH_API_PASSWORD "
                "(see .env.example) before running against a live manager."
            )
        try:
            resp = requests.post(
                f"{self.url}/security/user/authenticate",
                auth=(self.user, self.password),
                verify=self.verify,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise WazuhError(f"Manager unreachable at {self.url}: {exc}") from exc
        if resp.status_code != 200:
            raise WazuhError(
                f"Manager auth failed ({resp.status_code}): {resp.text[:300]}"
            )
        self._token = resp.json()["data"]["token"]
        return self._token

    @property
    def _headers(self) -> dict:
        if self._token is None:
            self.authenticate()
        return {"Authorization": f"Bearer {self._token}"}

    def logtest(
        self,
        event: str,
        log_format: str = "windows_eventchannel",
        location: str = "EventChannel",
    ) -> dict:
        """Submit one event to PUT /logtest and return the parsed `data` block.

        `data.output` is the alert-shaped result (empty dict if nothing matched);
        `data.output.rule.id` is the rule that fired.
        """
        body = {"log_format": log_format, "location": location, "event": event}
        try:
            resp = requests.put(
                f"{self.url}/logtest",
                json=body,
                headers=self._headers,
                verify=self.verify,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise WazuhError(f"/logtest request failed: {exc}") from exc
        if resp.status_code != 200:
            raise WazuhError(f"/logtest HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.json()["data"]

    @staticmethod
    def matched_rule_id(logtest_data: dict) -> str | None:
        """Extract the fired rule.id from a /logtest `data` block, or None."""
        output = logtest_data.get("output") or {}
        rule = output.get("rule") or {}
        rid = rule.get("id")
        return str(rid) if rid is not None else None


class WazuhIndexer:
    """Wazuh indexer / OpenSearch client (port 9200)."""

    def __init__(self, url: str, user: str, password: str, verify=None, timeout: int = 30):
        self.url = url.rstrip("/")
        self.auth = (user, password)
        self.verify = config.REQUESTS_VERIFY if verify is None else verify
        self.timeout = timeout

    def search(self, index: str, query: dict) -> dict:
        """POST a query to /{index}/_search and return the raw response JSON."""
        try:
            resp = requests.post(
                f"{self.url}/{index}/_search",
                json=query,
                auth=self.auth,
                verify=self.verify,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise WazuhError(f"Indexer unreachable at {self.url}: {exc}") from exc
        if resp.status_code != 200:
            raise WazuhError(f"_search HTTP {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    @staticmethod
    def hit_count(search_result: dict) -> int:
        total = search_result.get("hits", {}).get("total", 0)
        # OpenSearch returns {"value": N, "relation": "eq"}; ES-lite returns an int.
        if isinstance(total, dict):
            return int(total.get("value", 0))
        return int(total)


def manager_from_config() -> WazuhManager:
    return WazuhManager(config.MANAGER_URL, config.MANAGER_USER, config.MANAGER_PASSWORD)


def indexer_from_config() -> WazuhIndexer:
    return WazuhIndexer(config.INDEXER_URL, config.INDEXER_USER, config.INDEXER_PASSWORD)
