"""
Enrich holding records with live market data from yfinance.

Provides current price, market cap, sector, industry, and basic fundamentals
for each ticker found in the holdings dataset.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

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
