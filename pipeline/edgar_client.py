"""
SEC EDGAR client for fetching and caching 13F-HR filings.

Endpoints used
--------------
- Submissions index : GET {SEC_EDGAR_BASE_URL}/submissions/CIK{cik}.json
- Filing documents  : parsed from the submissions index
- Full-text search  : GET {SEC_EDGAR_FULL_TEXT}/search-index?q=...&dateRange=...
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Optional
from xml.etree import ElementTree

import requests

from config import (
    CACHE_DIR,
    SEC_BACKOFF_FACTOR,
    SEC_EDGAR_BASE_URL,
    SEC_EDGAR_FULL_TEXT,
    SEC_MAX_RETRIES,
    SEC_REQUEST_INTERVAL,
    USER_AGENT,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_last_request_ts: float = 0.0


def _rate_limit() -> None:
    """Sleep just long enough to honour the SEC rate-limit ceiling."""
    global _last_request_ts
    elapsed = time.monotonic() - _last_request_ts
    if elapsed < SEC_REQUEST_INTERVAL:
        time.sleep(SEC_REQUEST_INTERVAL - elapsed)
    _last_request_ts = time.monotonic()


def _session() -> requests.Session:
    """Return a reusable session with the required User-Agent header."""
    if not hasattr(_session, "_s"):
        s = requests.Session()
        s.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept-Encoding": "gzip, deflate",
            }
        )
        _session._s = s  # type: ignore[attr-defined]
    return _session._s  # type: ignore[attr-defined]


def _get(
    url: str, *, params: dict | None = None, raise_on_4xx: bool = True
) -> requests.Response:
    """
    Perform a rate-limited GET with exponential back-off on 429 / 5xx.

    Only *network* errors and transient server errors are retried.
    4xx client errors (e.g. 404) are returned or raised immediately.
    """
    for attempt in range(1, SEC_MAX_RETRIES + 1):
        _rate_limit()
        try:
            resp = _session().get(url, params=params, timeout=30)
        except requests.exceptions.RequestException as exc:
            if attempt == SEC_MAX_RETRIES:
                raise
            wait = SEC_BACKOFF_FACTOR**attempt
            logger.warning(
                "Network error for %s: %s — retrying in %ss (attempt %d/%d)",
                url,
                exc,
                wait,
                attempt,
                SEC_MAX_RETRIES,
            )
            time.sleep(wait)
            continue

        if resp.status_code == 200:
            return resp
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = SEC_BACKOFF_FACTOR**attempt
            logger.warning(
                "HTTP %s from %s — retrying in %ss (attempt %d/%d)",
                resp.status_code,
                url,
                wait,
                attempt,
                SEC_MAX_RETRIES,
            )
            time.sleep(wait)
            continue
        # 4xx (non-429) — no point retrying
        if raise_on_4xx:
            resp.raise_for_status()
        return resp
    raise RuntimeError(f"Failed to fetch {url} after {SEC_MAX_RETRIES} attempts")


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

def _cache_path(key: str) -> Path:
    """Return a filesystem-safe cache file path for *key*."""
    safe = re.sub(r"[^\w\-.]", "_", key)
    return CACHE_DIR / safe


def _read_cache(key: str) -> Optional[str]:
    p = _cache_path(key)
    if p.exists():
        logger.debug("Cache hit: %s", key)
        return p.read_text(encoding="utf-8")
    return None


def _write_cache(key: str, data: str) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(key).write_text(data, encoding="utf-8")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_submissions(cik: str, *, force: bool = False) -> dict[str, Any]:
    """
    Fetch the full submissions JSON for a given CIK.

    Parameters
    ----------
    cik : str
        10-digit zero-padded CIK, e.g. ``"0001067983"``.
    force : bool
        If *True*, bypass cache.

    Returns
    -------
    dict
        Parsed JSON from ``/submissions/CIK{cik}.json``.
    """
    cache_key = f"submissions_{cik}.json"
    if not force:
        cached = _read_cache(cache_key)
        if cached is not None:
            return json.loads(cached)

    url = f"{SEC_EDGAR_BASE_URL}/submissions/CIK{cik}.json"
    logger.info("Fetching submissions for CIK %s", cik)
    resp = _get(url)
    data = resp.text
    _write_cache(cache_key, data)
    return json.loads(data)


def get_13f_filings(
    cik: str,
    *,
    form_type: str = "13F-HR",
    max_filings: int = 8,
    force: bool = False,
) -> list[dict[str, Any]]:
    """
    Return recent 13F-HR filings for a CIK, newest first.

    Each returned dict contains at minimum:
    ``accessionNumber``, ``filingDate``, ``primaryDocument``, ``form``.
    """
    subs = fetch_submissions(cik, force=force)
    recent = subs.get("filings", {}).get("recent", {})
    if not recent:
        logger.warning("No recent filings found for CIK %s", cik)
        return []

    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])

    filings: list[dict[str, Any]] = []
    for i, form in enumerate(forms):
        if form == form_type or form == f"{form_type}/A":
            filings.append(
                {
                    "accessionNumber": accessions[i],
                    "filingDate": dates[i],
                    "primaryDocument": primary_docs[i],
                    "form": form,
                }
            )
            if len(filings) >= max_filings:
                break

    logger.info(
        "Found %d %s filing(s) for CIK %s", len(filings), form_type, cik
    )
    return filings


def _accession_to_path(accession: str) -> str:
    """Convert ``0001067983-24-000012`` to ``000106798324000012``."""
    return accession.replace("-", "")


_SEC_WWW = "https://www.sec.gov"


def _filing_base_path(cik: str, accession: str) -> str:
    """Return the Archives path segment (no domain) for a filing."""
    cik_int = str(int(cik))
    acc_nodash = _accession_to_path(accession)
    return f"/Archives/edgar/data/{cik_int}/{acc_nodash}"


def find_infotable_url(
    cik: str, accession: str, *, force: bool = False
) -> Optional[str]:
    """
    Locate the information-table XML document inside a 13F filing.

    The infotable filename varies per filing (often numeric like ``50240.xml``).
    We fetch the filing index HTML from ``www.sec.gov`` and pick the XML that
    contains the ``<informationTable>`` data — i.e. any XML that is NOT the
    primary cover document (``primary_doc.xml``).
    """
    acc_nodash = _accession_to_path(accession)
    cache_key = f"infotable_url_{cik}_{acc_nodash}"

    if not force:
        cached = _read_cache(cache_key)
        if cached is not None:
            return cached

    base_path = _filing_base_path(cik, accession)
    index_url = f"{_SEC_WWW}{base_path}/"

    logger.debug("Fetching filing index: %s", index_url)
    try:
        resp = _get(index_url, raise_on_4xx=False)
        if resp.status_code != 200:
            logger.warning("Filing index returned %s: %s", resp.status_code, index_url)
            return None

        xml_links = re.findall(r'href="([^"]*\.xml)"', resp.text, re.IGNORECASE)
        if not xml_links:
            logger.warning("No XML files found in filing index: %s", index_url)
            return None

        infotable_patterns = [
            re.compile(r"infotable", re.IGNORECASE),
            re.compile(r"information.?table", re.IGNORECASE),
            re.compile(r"13f.?info", re.IGNORECASE),
        ]

        def _resolve(link: str) -> str:
            if link.startswith("http"):
                return link
            if link.startswith("/"):
                return f"{_SEC_WWW}{link}"
            return f"{_SEC_WWW}{base_path}/{link}"

        # Pass 1: known infotable name patterns
        for link in xml_links:
            for pat in infotable_patterns:
                if pat.search(link):
                    url = _resolve(link)
                    logger.info("Found infotable (name match): %s", url)
                    _write_cache(cache_key, url)
                    return url

        # Pass 2: any XML that isn't the primary/cover document
        for link in xml_links:
            lower = link.lower()
            if "primary" not in lower and "cover" not in lower and "r13f" not in lower:
                url = _resolve(link)
                logger.info("Found infotable (non-primary XML): %s", url)
                _write_cache(cache_key, url)
                return url

    except Exception:
        logger.exception("Failed to locate infotable for CIK %s / %s", cik, accession)

    logger.warning(
        "Could not locate infotable for CIK %s / accession %s", cik, accession
    )
    return None


def fetch_infotable(
    cik: str, accession: str, *, force: bool = False
) -> Optional[str]:
    """
    Download the 13F information-table XML content as a string.
    """
    acc_nodash = _accession_to_path(accession)
    cache_key = f"infotable_{cik}_{acc_nodash}.xml"
    if not force:
        cached = _read_cache(cache_key)
        if cached is not None:
            return cached

    url = find_infotable_url(cik, accession, force=force)
    if url is None:
        return None

    logger.info("Downloading infotable: %s", url)
    resp = _get(url)
    data = resp.text
    _write_cache(cache_key, data)
    return data


# ---------------------------------------------------------------------------
# CIK lookup / verification
# ---------------------------------------------------------------------------

def lookup_cik(company_name: str) -> Optional[str]:
    """
    Search EDGAR full-text index for a company name and return the CIK.

    Returns a 10-digit zero-padded CIK string or *None* if no match.
    """
    url = f"{SEC_EDGAR_FULL_TEXT}/search-index"
    params = {
        "q": f'"{company_name}"',
        "dateRange": "custom",
        "startdt": "2020-01-01",
        "enddt": "2026-12-31",
        "forms": "13F-HR",
    }
    logger.info("Looking up CIK for '%s'", company_name)
    try:
        resp = _get(url, params=params)
        data = resp.json()
        hits = data.get("hits", {}).get("hits", [])
        if hits:
            cik_raw = hits[0].get("_source", {}).get("file_num", "")
            # file_num might be like "028-12345", we want the entity CIK instead
            entity_cik = hits[0].get("_source", {}).get("entity_id", "")
            if entity_cik:
                return str(entity_cik).zfill(10)
    except Exception:
        logger.exception("CIK lookup failed for '%s'", company_name)

    # Fallback: use the company search JSON endpoint
    try:
        search_url = f"{SEC_EDGAR_BASE_URL}/submissions/CIK.json"
        # This doesn't exist as a direct endpoint; use company tickers
        tickers_url = "https://www.sec.gov/files/company_tickers.json"
        resp = _get(tickers_url)
        tickers_data = resp.json()
        name_lower = company_name.lower()
        for _key, entry in tickers_data.items():
            if name_lower in entry.get("title", "").lower():
                return str(entry["cik_str"]).zfill(10)
    except Exception:
        logger.exception("Fallback CIK lookup failed for '%s'", company_name)

    return None


def verify_cik(cik: str, expected_name: str) -> bool:
    """
    Verify that a CIK corresponds (roughly) to the expected fund name.
    """
    try:
        subs = fetch_submissions(cik)
        entity_name = subs.get("name", "").lower()
        expected_lower = expected_name.lower()
        # Check for substring overlap of significant words
        expected_words = {
            w for w in expected_lower.split() if len(w) > 3
        }
        if not expected_words:
            return expected_lower in entity_name
        matches = sum(1 for w in expected_words if w in entity_name)
        return matches / len(expected_words) >= 0.4
    except Exception:
        logger.exception("CIK verification failed for %s", cik)
        return False
