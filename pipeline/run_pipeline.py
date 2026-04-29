#!/usr/bin/env python3
"""
Smart Investor Pipeline — main orchestrator.

Usage
-----
    python run_pipeline.py                        # latest available quarter
    python run_pipeline.py --quarter Q4-2024
    python run_pipeline.py --force-refresh
    python run_pipeline.py --investors-file custom.json --no-momentum
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from config import (
    DATA_OUTPUT_DIR,
    FRONTEND_DATA_DIR,
    INVESTORS_FILE,
    LOG_FORMAT,
    LOG_LEVEL,
)
from edgar_client import (
    fetch_infotable,
    get_13f_filings,
    verify_cik,
)
from enrichment import enrich_holdings, resolve_tickers_openfigi
from parser_13f import compare_quarters, parse_infotable_xml
from scoring import (
    aggregate_holdings,
    identify_sell_signals,
    identify_top_picks,
    score_stocks,
)

logger = logging.getLogger("smart_investor")

# ---------------------------------------------------------------------------
# Quarter utilities
# ---------------------------------------------------------------------------

def _current_quarter() -> str:
    """Return the most recently *ended* quarter label, e.g. ``Q4-2024``."""
    now = datetime.now()
    # 13F filings are due ~45 days after quarter end.
    # We look at the previous quarter.
    month = now.month
    year = now.year
    if month <= 3:
        return f"Q4-{year - 1}"
    elif month <= 6:
        return f"Q1-{year}"
    elif month <= 9:
        return f"Q2-{year}"
    else:
        return f"Q3-{year}"


def _quarter_end_date(quarter: str) -> str:
    """
    Return the approximate end-date for a quarter label.

    ``Q1-2024`` -> ``2024-03-31``.
    """
    parts = quarter.split("-")
    q = parts[0].upper()
    year = int(parts[1])
    end_dates = {
        "Q1": f"{year}-03-31",
        "Q2": f"{year}-06-30",
        "Q3": f"{year}-09-30",
        "Q4": f"{year}-12-31",
    }
    return end_dates.get(q, f"{year}-12-31")


def _previous_quarter(quarter: str) -> str:
    """Return the quarter label immediately before *quarter*."""
    parts = quarter.split("-")
    q_num = int(parts[0][1])
    year = int(parts[1])
    if q_num == 1:
        return f"Q4-{year - 1}"
    return f"Q{q_num - 1}-{year}"


def _filing_matches_quarter(filing_date: str, quarter: str) -> bool:
    """
    Check whether a filing date plausibly belongs to a quarter.

    13F filings for a quarter are typically filed within 45 days of the
    quarter end, but sometimes later.  We accept filings dated within
    90 days after the quarter end.
    """
    q_end = _quarter_end_date(quarter)
    try:
        fd = datetime.strptime(filing_date, "%Y-%m-%d")
        qe = datetime.strptime(q_end, "%Y-%m-%d")
        delta = (fd - qe).days
        return 0 <= delta <= 90
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Per-investor processing
# ---------------------------------------------------------------------------

def _process_investor(
    investor: dict[str, Any],
    quarter: str,
    *,
    force: bool = False,
) -> dict[str, Any] | None:
    """
    Fetch, parse, and diff a single investor's 13F filing.

    Returns a dict with keys ``investor_name``, ``holdings``, ``changes``,
    or *None* if the filing could not be obtained.
    """
    name = investor["name"]
    fund = investor["fund"]
    cik = investor["cik"]

    logger.info("Processing %s (%s) — CIK %s", name, fund, cik)

    # Optionally verify CIK
    if not investor.get("cik_verified", False):
        if verify_cik(cik, fund):
            logger.info("CIK %s verified for %s", cik, fund)
        else:
            logger.warning(
                "CIK %s may not match %s — proceeding anyway", cik, fund
            )

    # Fetch filings list
    filings = get_13f_filings(cik, force=force)
    if not filings:
        logger.warning("No 13F filings found for %s", name)
        return None

    # Find the filing for the requested quarter
    current_filing = None
    previous_filing = None
    prev_quarter = _previous_quarter(quarter)

    for f in filings:
        if current_filing is None and _filing_matches_quarter(
            f["filingDate"], quarter
        ):
            current_filing = f
        elif previous_filing is None and _filing_matches_quarter(
            f["filingDate"], prev_quarter
        ):
            previous_filing = f

    if current_filing is None:
        # Fall back to the most recent filing available
        logger.warning(
            "No %s filing found for %s; using most recent (%s)",
            quarter,
            name,
            filings[0]["filingDate"],
        )
        current_filing = filings[0]
        if len(filings) > 1:
            previous_filing = filings[1]

    # Fetch and parse current infotable
    xml = fetch_infotable(cik, current_filing["accessionNumber"], force=force)
    if not xml:
        logger.warning("Could not download infotable for %s", name)
        return None

    current_holdings = parse_infotable_xml(xml)
    if not current_holdings:
        logger.warning("Parsed zero holdings for %s (%s)", name, quarter)
        return None

    logger.info(
        "%s: %d holdings in %s (filed %s)",
        name,
        len(current_holdings),
        quarter,
        current_filing["filingDate"],
    )

    # Parse previous quarter for comparison
    changes: dict[str, Any] = {}
    if previous_filing:
        prev_xml = fetch_infotable(
            cik, previous_filing["accessionNumber"], force=force
        )
        if prev_xml:
            prev_holdings = parse_infotable_xml(prev_xml)
            if prev_holdings:
                changes = compare_quarters(current_holdings, prev_holdings)
                logger.info(
                    "%s quarter diff: %d new, %d exited, %d increased, %d decreased",
                    name,
                    len(changes.get("new", [])),
                    len(changes.get("exited", [])),
                    len(changes.get("increased", [])),
                    len(changes.get("decreased", [])),
                )

    return {
        "investor_name": name,
        "fund": fund,
        "cik": cik,
        "quarter": quarter,
        "filing_date": current_filing["filingDate"],
        "holdings": current_holdings,
        "changes": changes,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _write_json(data: Any, *paths: Path) -> None:
    """Write *data* as pretty-printed JSON to one or more paths."""
    payload = json.dumps(data, indent=2, default=str, ensure_ascii=False)
    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(payload, encoding="utf-8")
        logger.info("Wrote %s (%d bytes)", p, len(payload))


def _build_summary(
    scored_stocks: list[dict[str, Any]],
    sell_signals: list[dict[str, Any]],
    investor_count: int,
    quarter: str,
) -> dict[str, Any]:
    """Build the dashboard summary object."""
    top_picks = identify_top_picks(scored_stocks, top_n=20)

    # Sector distribution
    sector_counts: dict[str, int] = {}
    for s in scored_stocks:
        sector = (s.get("enrichment") or {}).get("sector", "Unknown")
        sector_counts[sector] = sector_counts.get(sector, 0) + 1

    # Market cap distribution
    cap_counts: dict[str, int] = {}
    for s in scored_stocks:
        cap = (s.get("enrichment") or {}).get("marketCapCategory", "Unknown")
        cap_counts[cap] = cap_counts.get(cap, 0) + 1

    return {
        "generated_at": datetime.now().isoformat(),
        "quarter": quarter,
        "investor_count": investor_count,
        "total_unique_stocks": len(scored_stocks),
        "top_picks": [
            {
                "rank": i + 1,
                "ticker": s.get("ticker", ""),
                "name": s.get("nameOfIssuer", ""),
                "overall_score": s["scores"]["overall"],
                "consensus": s["scores"]["consensus"],
                "conviction": s["scores"]["conviction"],
                "fundamental": s["scores"]["fundamental"],
                "price_value": s["scores"]["price_value"],
                "holder_count": s.get("holder_count", 0),
                "new_position_count": s.get("new_position_count", 0),
                "sector": (s.get("enrichment") or {}).get("sector", ""),
                "market_cap_category": (s.get("enrichment") or {}).get(
                    "marketCapCategory", ""
                ),
                "current_price": (s.get("enrichment") or {}).get(
                    "currentPrice"
                ),
            }
            for i, s in enumerate(top_picks)
        ],
        "sell_signals": sell_signals[:10],
        "sector_distribution": sector_counts,
        "market_cap_distribution": cap_counts,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(
    quarter: str | None = None,
    force: bool = False,
    investors_file: Path | None = None,
    compute_momentum: bool = True,
) -> None:
    """Execute the full pipeline."""
    quarter = quarter or _current_quarter()
    investors_path = investors_file or INVESTORS_FILE

    logger.info("=" * 60)
    logger.info("Smart Investor Pipeline")
    logger.info("Quarter: %s", quarter)
    logger.info("Investors file: %s", investors_path)
    logger.info("Force refresh: %s", force)
    logger.info("=" * 60)

    # ------------------------------------------------------------------
    # 1. Load investors
    # ------------------------------------------------------------------
    with open(investors_path, "r", encoding="utf-8") as f:
        investors: list[dict[str, Any]] = json.load(f)
    logger.info("Loaded %d investors", len(investors))

    # ------------------------------------------------------------------
    # 2. Fetch & parse each investor's 13F
    # ------------------------------------------------------------------
    all_investor_holdings: list[dict[str, Any]] = []
    success_count = 0
    fail_count = 0

    for investor in investors:
        try:
            result = _process_investor(investor, quarter, force=force)
            if result:
                all_investor_holdings.append(result)
                success_count += 1
            else:
                fail_count += 1
        except Exception:
            logger.exception(
                "Unhandled error processing %s", investor.get("name", "?")
            )
            fail_count += 1
        # Small pause between investors to be polite to SEC servers
        time.sleep(0.2)

    logger.info(
        "Investor processing complete: %d succeeded, %d failed",
        success_count,
        fail_count,
    )

    if not all_investor_holdings:
        logger.error("No holdings data collected — aborting")
        sys.exit(1)

    # ------------------------------------------------------------------
    # 3. Aggregate all holdings by stock
    # ------------------------------------------------------------------
    stock_map = aggregate_holdings(all_investor_holdings)

    # ------------------------------------------------------------------
    # 4a. Resolve tickers (CUSIP -> ticker via OpenFIGI, then name fallback)
    # ------------------------------------------------------------------
    all_holdings_flat: list[dict[str, Any]] = []
    for inv in all_investor_holdings:
        all_holdings_flat.extend(inv.get("holdings", []))

    logger.info(
        "Resolving tickers for %d holding records", len(all_holdings_flat)
    )

    # Primary: OpenFIGI batch CUSIP lookup (fast, high coverage)
    try:
        resolve_tickers_openfigi(all_holdings_flat)
    except Exception:
        logger.exception(
            "OpenFIGI resolution failed — continuing without it"
        )

    # Count how many still lack a ticker
    missing_before = sum(1 for h in all_holdings_flat if not h.get("ticker"))
    logger.info(
        "After OpenFIGI: %d / %d holdings still missing ticker",
        missing_before,
        len(all_holdings_flat),
    )

    # Note: yfinance name-search fallback disabled — it searches by company
    # name (e.g. "ASHLAND") which yfinance doesn't support. OpenFIGI + cache
    # provide sufficient coverage.

    missing_after = sum(1 for h in all_holdings_flat if not h.get("ticker"))
    logger.info(
        "Ticker resolution complete: %d / %d holdings have tickers "
        "(%d still missing)",
        len(all_holdings_flat) - missing_after,
        len(all_holdings_flat),
        missing_after,
    )

    # ------------------------------------------------------------------
    # 4b. Aggregate first, then enrich only relevant stocks
    # ------------------------------------------------------------------
    stock_map = aggregate_holdings(all_investor_holdings)

    # Only enrich stocks held by 2+ investors (filters out thousands of
    # irrelevant bonds, warrants, and micro-positions)
    relevant_holdings = []
    for stock in stock_map.values():
        if stock.get("holder_count", 0) >= 2 and stock.get("ticker"):
            for h in all_holdings_flat:
                if h.get("cusip") == stock["cusip"]:
                    relevant_holdings.append(h)
                    break

    logger.info(
        "Enriching %d relevant holdings (2+ holders) via yfinance "
        "(skipping %d single-holder positions)",
        len(relevant_holdings),
        len(stock_map) - len(relevant_holdings),
    )
    enrich_holdings(relevant_holdings, force=force)

    # Re-aggregate to pick up enrichment data
    stock_map = aggregate_holdings(all_investor_holdings)

    # ------------------------------------------------------------------
    # 5. Score stocks
    # ------------------------------------------------------------------
    total_investors = len(all_investor_holdings)
    scored = score_stocks(
        stock_map, total_investors, compute_momentum=compute_momentum
    )

    # ------------------------------------------------------------------
    # 6. Identify sell signals
    # ------------------------------------------------------------------
    sell_signals = identify_sell_signals(
        all_investor_holdings, scored_stocks=scored, min_exits=2
    )

    # ------------------------------------------------------------------
    # 7. Output JSON
    # ------------------------------------------------------------------
    holdings_paths = [
        DATA_OUTPUT_DIR / "holdings.json",
        FRONTEND_DATA_DIR / "holdings.json",
    ]
    summary_paths = [
        DATA_OUTPUT_DIR / "summary.json",
        FRONTEND_DATA_DIR / "summary.json",
    ]

    _write_json(scored, *holdings_paths)

    summary = _build_summary(scored, sell_signals, total_investors, quarter)
    _write_json(summary, *summary_paths)

    # ------------------------------------------------------------------
    # 8. Done
    # ------------------------------------------------------------------
    logger.info("=" * 60)
    logger.info("Pipeline complete")
    logger.info("  Quarter        : %s", quarter)
    logger.info("  Investors      : %d processed", total_investors)
    logger.info("  Unique stocks  : %d scored", len(scored))
    logger.info("  Top pick       : %s (score %.1f)",
                scored[0].get("ticker", scored[0].get("nameOfIssuer", "?")),
                scored[0]["scores"]["overall"] if scored else 0)
    logger.info("  Sell signals   : %d", len(sell_signals))
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Smart Investor Pipeline — scrape, parse, score 13F filings",
    )
    parser.add_argument(
        "--quarter",
        type=str,
        default=None,
        help="Quarter to process, e.g. Q4-2024 (default: latest ended quarter)",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        default=False,
        help="Bypass all caches and re-download everything",
    )
    parser.add_argument(
        "--investors-file",
        type=Path,
        default=None,
        help="Path to a custom investors JSON file",
    )
    parser.add_argument(
        "--no-momentum",
        action="store_true",
        default=False,
        help="Skip momentum alignment scoring (faster, no yfinance price history)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default=LOG_LEVEL,
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity (default: INFO)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format=LOG_FORMAT,
    )

    run(
        quarter=args.quarter,
        force=args.force_refresh,
        investors_file=args.investors_file,
        compute_momentum=not args.no_momentum,
    )


if __name__ == "__main__":
    main()
