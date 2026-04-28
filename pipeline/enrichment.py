"""
Enrich holding records with live market data from yfinance.

Provides current price, market cap, sector, industry, and basic fundamentals
for each ticker found in the holdings dataset.

Also provides CUSIP-to-ticker resolution via the OpenFIGI API as a
high-coverage first pass, with yfinance name-search as a fallback.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import requests
import yfinance as yf

from config import CACHE_DIR, YFINANCE_CACHE_TTL_HOURS
from parser_13f import cusip_to_ticker, register_cusip_ticker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_ENRICHMENT_CACHE_FILE = CACHE_DIR / "yfinance_cache.json"
_enrichment_cache: dict[str, dict[str, Any]] = {}
_cache_loaded = False


def _load_cache() -> None:
    """Load the on-disk yfinance cache into memory."""
    global _enrichment_cache, _cache_loaded
    if _cache_loaded:
        return
    _cache_loaded = True
    if _ENRICHMENT_CACHE_FILE.exists():
        try:
            raw = _ENRICHMENT_CACHE_FILE.read_text(encoding="utf-8")
            _enrichment_cache = json.loads(raw)
            logger.debug(
                "Loaded %d entries from yfinance cache", len(_enrichment_cache)
            )
        except Exception:
            logger.warning("Failed to load yfinance cache; starting fresh")
            _enrichment_cache = {}


def _save_cache() -> None:
    """Persist the in-memory cache to disk."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _ENRICHMENT_CACHE_FILE.write_text(
        json.dumps(_enrichment_cache, indent=2, default=str),
        encoding="utf-8",
    )


def _is_cache_fresh(entry: dict[str, Any]) -> bool:
    """Check whether a cached entry is still within the TTL."""
    ts = entry.get("_cached_at")
    if ts is None:
        return False
    try:
        cached_at = datetime.fromisoformat(ts)
        return datetime.now() - cached_at < timedelta(hours=YFINANCE_CACHE_TTL_HOURS)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Market-cap categorisation
# ---------------------------------------------------------------------------

def categorize_market_cap(market_cap: Optional[float]) -> str:
    """
    Categorise market capitalisation into human-readable buckets.

    - Mega:  > $200B
    - Large: $10B -- $200B
    - Mid:   $2B -- $10B
    - Small: < $2B
    """
    if market_cap is None:
        return "Unknown"
    if market_cap > 200_000_000_000:
        return "Mega"
    if market_cap > 10_000_000_000:
        return "Large"
    if market_cap > 2_000_000_000:
        return "Mid"
    return "Small"


# ---------------------------------------------------------------------------
# Single-ticker enrichment
# ---------------------------------------------------------------------------

def enrich_ticker(ticker: str, *, force: bool = False) -> dict[str, Any]:
    """
    Fetch enrichment data for a single ticker symbol.

    Returns a dict with keys: ticker, currentPrice, marketCap,
    marketCapCategory, sector, industry, peRatio, revenueGrowthYoY,
    profitMargin, fiftyTwoWeekHigh, fiftyTwoWeekLow, _cached_at.
    """
    _load_cache()

    if not force and ticker in _enrichment_cache:
        cached = _enrichment_cache[ticker]
        if _is_cache_fresh(cached):
            logger.debug("Enrichment cache hit for %s", ticker)
            return cached

    logger.info("Fetching yfinance data for %s", ticker)
    result: dict[str, Any] = {"ticker": ticker}

    try:
        info = yf.Ticker(ticker).info
        if not info or info.get("trailingPegRatio") is None and info.get("currentPrice") is None:
            # yfinance sometimes returns a near-empty dict for invalid tickers
            if not info.get("shortName"):
                logger.warning("No data returned by yfinance for %s", ticker)
                result["error"] = "no_data"
                return result

        result["currentPrice"] = info.get("currentPrice") or info.get(
            "regularMarketPrice"
        )
        result["marketCap"] = info.get("marketCap")
        result["marketCapCategory"] = categorize_market_cap(
            info.get("marketCap")
        )
        result["sector"] = info.get("sector", "Unknown")
        result["industry"] = info.get("industry", "Unknown")
        result["peRatio"] = info.get("trailingPE") or info.get("forwardPE")
        result["revenueGrowthYoY"] = info.get("revenueGrowth")
        result["profitMargin"] = info.get("profitMargins")
        result["fiftyTwoWeekHigh"] = info.get("fiftyTwoWeekHigh")
        result["fiftyTwoWeekLow"] = info.get("fiftyTwoWeekLow")
        result["shortName"] = info.get("shortName", "")
        result["_cached_at"] = datetime.now().isoformat()

    except Exception:
        logger.exception("yfinance error for %s", ticker)
        result["error"] = "fetch_failed"

    _enrichment_cache[ticker] = result
    return result


# ---------------------------------------------------------------------------
# CUSIP -> Ticker resolution via OpenFIGI API
# ---------------------------------------------------------------------------

_OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
_OPENFIGI_BATCH_SIZE = 10  # max CUSIPs per request (API limit)
_OPENFIGI_REQUESTS_PER_SEC = 4  # well under the 250/min free-tier cap
_CUSIP_TICKER_CACHE_FILE = CACHE_DIR / "cusip_ticker_cache.json"


def _load_cusip_ticker_cache() -> dict[str, str]:
    """Load the on-disk CUSIP-to-ticker cache."""
    if _CUSIP_TICKER_CACHE_FILE.exists():
        try:
            raw = _CUSIP_TICKER_CACHE_FILE.read_text(encoding="utf-8")
            data = json.loads(raw)
            logger.debug(
                "Loaded %d entries from CUSIP-ticker cache", len(data)
            )
            return data
        except Exception:
            logger.warning("Failed to load CUSIP-ticker cache; starting fresh")
    return {}


def _save_cusip_ticker_cache(cache: dict[str, str]) -> None:
    """Persist the CUSIP-to-ticker cache to disk."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _CUSIP_TICKER_CACHE_FILE.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def resolve_tickers_openfigi(holdings: list[dict[str, Any]]) -> None:
    """
    Resolve ticker symbols for holdings via the OpenFIGI API.

    Mutates each holding dict in-place, setting the ``ticker`` key when a
    match is found.  Results are cached to disk so subsequent runs skip
    already-resolved CUSIPs.

    The free tier allows 250 requests/minute with up to 10 jobs (CUSIPs)
    per request — i.e. 2 500 lookups per minute.
    """
    disk_cache = _load_cusip_ticker_cache()

    # ----- First, resolve from the built-in map + disk cache -----
    cusips_needing_lookup: dict[str, list[dict[str, Any]]] = {}
    for h in holdings:
        if h.get("ticker"):
            continue
        cusip = h.get("cusip", "").strip()
        if not cusip:
            continue

        # Try built-in map (parser_13f)
        ticker = cusip_to_ticker(cusip)
        if ticker:
            h["ticker"] = ticker
            continue

        # Try disk cache
        if cusip in disk_cache:
            cached_ticker = disk_cache[cusip]
            if cached_ticker:  # non-empty means we found it before
                h["ticker"] = cached_ticker
                register_cusip_ticker(cusip, cached_ticker)
            # empty string means we tried before and got no result — skip
            continue

        # Need to look up via OpenFIGI
        cusips_needing_lookup.setdefault(cusip, []).append(h)

    unique_cusips = list(cusips_needing_lookup.keys())
    if not unique_cusips:
        logger.info(
            "OpenFIGI: all %d holdings already have tickers or are cached",
            len(holdings),
        )
        return

    logger.info(
        "OpenFIGI: resolving %d unique CUSIPs (%d holdings without ticker)",
        len(unique_cusips),
        sum(len(v) for v in cusips_needing_lookup.values()),
    )

    resolved_count = 0
    failed_count = 0
    batches = [
        unique_cusips[i : i + _OPENFIGI_BATCH_SIZE]
        for i in range(0, len(unique_cusips), _OPENFIGI_BATCH_SIZE)
    ]

    for batch_idx, batch in enumerate(batches):
        # Build the jobs payload
        jobs = [{"idType": "ID_CUSIP", "idValue": c} for c in batch]

        try:
            resp = requests.post(
                _OPENFIGI_URL,
                json=jobs,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            if resp.status_code == 429:
                # Rate-limited — back off and retry once
                logger.warning("OpenFIGI rate-limited; backing off 15 s")
                time.sleep(15)
                resp = requests.post(
                    _OPENFIGI_URL,
                    json=jobs,
                    headers={"Content-Type": "application/json"},
                    timeout=30,
                )

            if resp.status_code != 200:
                logger.warning(
                    "OpenFIGI returned HTTP %d for batch %d; skipping",
                    resp.status_code,
                    batch_idx,
                )
                failed_count += len(batch)
                continue

            results = resp.json()

            for cusip, result in zip(batch, results):
                data_list = result.get("data")
                if data_list and isinstance(data_list, list):
                    # Prefer US-exchange common stock if available
                    ticker = None
                    for entry in data_list:
                        t = entry.get("ticker", "")
                        exch = entry.get("exchCode", "")
                        sec_type = entry.get("securityType", "")
                        if t and exch == "US" and sec_type in (
                            "Common Stock", "ETP", "REIT",
                        ):
                            ticker = t
                            break
                    # Fallback: take the first entry with a ticker
                    if not ticker:
                        for entry in data_list:
                            t = entry.get("ticker", "")
                            if t:
                                ticker = t
                                break

                    if ticker:
                        disk_cache[cusip] = ticker
                        register_cusip_ticker(cusip, ticker)
                        for h in cusips_needing_lookup[cusip]:
                            h["ticker"] = ticker
                        resolved_count += 1
                    else:
                        disk_cache[cusip] = ""  # remember the miss
                        failed_count += 1
                else:
                    # No data or error for this CUSIP
                    disk_cache[cusip] = ""
                    failed_count += 1

        except requests.RequestException as exc:
            logger.warning(
                "OpenFIGI request failed for batch %d: %s", batch_idx, exc
            )
            failed_count += len(batch)
        except (ValueError, KeyError) as exc:
            logger.warning(
                "OpenFIGI response parse error for batch %d: %s",
                batch_idx,
                exc,
            )
            failed_count += len(batch)

        # Log progress every 100 CUSIPs (= every 10 batches)
        processed_so_far = (batch_idx + 1) * _OPENFIGI_BATCH_SIZE
        if processed_so_far % 100 == 0 or batch_idx == len(batches) - 1:
            logger.info(
                "OpenFIGI progress: %d / %d CUSIPs processed "
                "(%d resolved, %d failed)",
                min(processed_so_far, len(unique_cusips)),
                len(unique_cusips),
                resolved_count,
                failed_count,
            )

        # Rate-limit: ~4 requests per second
        if batch_idx < len(batches) - 1:
            time.sleep(1.0 / _OPENFIGI_REQUESTS_PER_SEC)

    # Persist cache to disk
    _save_cusip_ticker_cache(disk_cache)

    logger.info(
        "OpenFIGI complete: %d resolved, %d unresolved out of %d unique CUSIPs",
        resolved_count,
        failed_count,
        len(unique_cusips),
    )


def resolve_tickers_by_name(holdings: list[dict[str, Any]]) -> None:
    """
    Fallback ticker resolution using yfinance name search.

    For holdings that still lack a ticker after OpenFIGI, attempt to
    find one by searching yfinance with the issuer name.  Results are
    cached in the same CUSIP-ticker disk cache.

    This is intentionally slow (one lookup per unique issuer) and is
    meant only for the small residual set that OpenFIGI couldn't resolve.
    """
    disk_cache = _load_cusip_ticker_cache()

    # Collect holdings still missing a ticker, grouped by CUSIP
    remaining: dict[str, list[dict[str, Any]]] = {}
    for h in holdings:
        if h.get("ticker"):
            continue
        cusip = h.get("cusip", "").strip()
        if not cusip:
            continue
        # Skip if we already tried and failed (empty string in cache)
        if cusip in disk_cache and disk_cache[cusip] == "":
            # Only skip if it was an OpenFIGI miss — give name-search a shot
            # We use a different sentinel to distinguish name-search misses.
            pass
        remaining.setdefault(cusip, []).append(h)

    if not remaining:
        logger.info("Name-search: no holdings left to resolve")
        return

    # Build unique (cusip, name) pairs
    cusip_names: list[tuple[str, str]] = []
    seen: set[str] = set()
    for cusip, hs in remaining.items():
        if cusip in seen:
            continue
        seen.add(cusip)
        name = hs[0].get("nameOfIssuer", "")
        cusip_names.append((cusip, name))

    logger.info(
        "Name-search: attempting yfinance lookup for %d remaining CUSIPs",
        len(cusip_names),
    )

    resolved_count = 0
    for idx, (cusip, issuer_name) in enumerate(cusip_names, 1):
        if not issuer_name:
            continue
        try:
            # Try first word as ticker guess
            first_word = issuer_name.split()[0].upper()
            search = yf.Ticker(first_word)
            info = search.info
            if info and info.get("symbol"):
                ticker = info["symbol"]
                disk_cache[cusip] = ticker
                register_cusip_ticker(cusip, ticker)
                for h in remaining[cusip]:
                    h["ticker"] = ticker
                resolved_count += 1
                continue
        except Exception:
            pass

        # Be polite to Yahoo Finance
        time.sleep(0.5)

        if idx % 50 == 0:
            logger.info(
                "Name-search progress: %d / %d (%d resolved)",
                idx,
                len(cusip_names),
                resolved_count,
            )

    # Persist updated cache
    _save_cusip_ticker_cache(disk_cache)

    logger.info(
        "Name-search complete: %d resolved out of %d attempted",
        resolved_count,
        len(cusip_names),
    )


# ---------------------------------------------------------------------------
# Batch enrichment
# ---------------------------------------------------------------------------

def enrich_holdings(
    holdings: list[dict[str, Any]], *, force: bool = False
) -> list[dict[str, Any]]:
    """
    Enrich a list of holding records in-place.

    For each holding that has a resolvable ticker (via CUSIP or a ``ticker``
    field already present), fetches market data and attaches it under the
    ``enrichment`` key.

    Returns the same list (mutated) for convenience.
    """
    _load_cache()
    tickers_seen: set[str] = set()
    enrichment_map: dict[str, dict[str, Any]] = {}

    # First pass: resolve tickers
    for h in holdings:
        ticker = h.get("ticker") or cusip_to_ticker(h.get("cusip", ""))
        if ticker:
            h["ticker"] = ticker
            if ticker not in tickers_seen:
                tickers_seen.add(ticker)

    # Fetch enrichment data (with a small delay between calls to be polite)
    total = len(tickers_seen)
    for idx, ticker in enumerate(sorted(tickers_seen), 1):
        if idx % 20 == 0:
            logger.info("Enrichment progress: %d / %d tickers", idx, total)
        data = enrich_ticker(ticker, force=force)
        enrichment_map[ticker] = data
        # Small delay to avoid hammering Yahoo Finance
        if idx < total:
            time.sleep(0.2)

    # Second pass: attach enrichment data
    for h in holdings:
        ticker = h.get("ticker")
        if ticker and ticker in enrichment_map:
            h["enrichment"] = enrichment_map[ticker]

    # Persist the cache
    _save_cache()

    logger.info(
        "Enrichment complete: %d tickers enriched out of %d holdings",
        len(enrichment_map),
        len(holdings),
    )
    return holdings


# ---------------------------------------------------------------------------
# CUSIP resolution via yfinance (fallback)
# ---------------------------------------------------------------------------

def resolve_cusip_via_yfinance(cusip: str, issuer_name: str) -> Optional[str]:
    """
    Attempt to find a ticker for a CUSIP by searching yfinance with the
    issuer name.  This is a best-effort heuristic.
    """
    if not issuer_name:
        return None

    # yfinance doesn't have a direct CUSIP lookup, but we can search by name
    try:
        # Try obvious ticker guesses derived from the name
        # e.g. "APPLE" -> "AAPL" won't work, but "APPLE INC" might match
        search = yf.Ticker(issuer_name.split()[0])
        info = search.info
        if info and info.get("symbol"):
            ticker = info["symbol"]
            register_cusip_ticker(cusip, ticker)
            return ticker
    except Exception:
        pass

    return None


def get_price_history(
    ticker: str, period: str = "6mo", interval: str = "1wk"
) -> Optional[list[dict[str, Any]]]:
    """
    Fetch price history for a ticker and return as a list of dicts.

    Used by the scoring module for momentum analysis.
    """
    try:
        hist = yf.Ticker(ticker).history(period=period, interval=interval)
        if hist.empty:
            return None
        records: list[dict[str, Any]] = []
        for date, row in hist.iterrows():
            records.append(
                {
                    "date": date.strftime("%Y-%m-%d"),
                    "close": round(row["Close"], 2),
                    "volume": int(row["Volume"]),
                }
            )
        return records
    except Exception:
        logger.exception("Failed to fetch price history for %s", ticker)
        return None
