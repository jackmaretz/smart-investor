"""
Scoring engine for the Smart Investor pipeline.

Computes per-stock scores based on how many top investors hold the stock,
their conviction (portfolio weight), recent activity, and price momentum.
"""

from __future__ import annotations

import logging
import statistics
from typing import Any, Optional

from config import (
    NEW_POSITION_BONUS_POINTS,
    NEW_POSITION_BONUS_THRESHOLD,
    SCORING_WEIGHTS,
)
from enrichment import get_price_history

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Investor quality weights — higher-quality track records get more influence
# ---------------------------------------------------------------------------
# These are subjective editorial weights (0.5 - 1.5).  They modulate how
# much a given investor's presence counts towards the consensus score.
_INVESTOR_QUALITY: dict[str, float] = {
    "Warren Buffett": 1.5,
    "Stanley Druckenmiller": 1.4,
    "Seth Klarman": 1.4,
    "Li Lu": 1.3,
    "Joel Greenblatt": 1.3,
    "Michael Burry": 1.1,
    "Mohnish Pabrai": 1.2,
    "David Tepper": 1.3,
    "Bill Ackman": 1.2,
    "David Einhorn": 1.2,
    "Chris Hohn": 1.3,
    "Chuck Akre": 1.2,
    "Tom Russo": 1.1,
    "Pat Dorsey": 1.1,
    "Terry Smith": 1.2,
    "Howard Marks": 1.2,
    "Carl Icahn": 1.0,
    "George Soros": 1.1,
    "Dan Loeb": 1.0,
    "Chase Coleman": 1.0,
    "Andreas Halvorsen": 1.1,
    "Philippe Laffont": 1.0,
    "Ken Griffin": 0.8,
    "Jim Simons": 0.8,
    "Ray Dalio": 0.9,
}
_DEFAULT_QUALITY = 1.0


def _quality(investor_name: str) -> float:
    return _INVESTOR_QUALITY.get(investor_name, _DEFAULT_QUALITY)


# ---------------------------------------------------------------------------
# Data aggregation
# ---------------------------------------------------------------------------

def aggregate_holdings(
    all_investor_holdings: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    Aggregate parsed holdings from all investors into a per-stock view.

    Parameters
    ----------
    all_investor_holdings : list
        Each item is a dict with keys ``investor_name``, ``holdings``
        (list of holding dicts), and optionally ``changes`` (output of
        ``compare_quarters``).

    Returns
    -------
    dict
        Keyed by CUSIP.  Each value contains:
        - ``cusip``, ``nameOfIssuer``, ``ticker``
        - ``holders``: list of dicts (investor_name, shares, value, change_type, portfolio_weight)
        - ``holder_count``: int
        - ``total_value``: sum of value across holders (in $thousands)
        - ``new_position_count``: how many investors opened a new position this quarter
    """
    stock_map: dict[str, dict[str, Any]] = {}

    for inv in all_investor_holdings:
        investor_name = inv.get("investor_name", "Unknown")
        holdings = inv.get("holdings", [])
        changes = inv.get("changes", {})

        # Build a set of CUSIPs that are new positions for this investor
        new_cusips: set[str] = set()
        if changes:
            for h in changes.get("new", []):
                c = h.get("cusip", "")
                if c:
                    new_cusips.add(c)

        # Calculate total portfolio value for this investor (for weight calc)
        total_portfolio_value = sum(h.get("value", 0) for h in holdings)

        for h in holdings:
            cusip = h.get("cusip", "")
            if not cusip:
                continue

            if cusip not in stock_map:
                stock_map[cusip] = {
                    "cusip": cusip,
                    "nameOfIssuer": h.get("nameOfIssuer", ""),
                    "ticker": h.get("ticker", ""),
                    "holders": [],
                    "holder_count": 0,
                    "total_value": 0,
                    "new_position_count": 0,
                    "enrichment": h.get("enrichment"),
                }

            value = h.get("value", 0)
            shares = h.get("shares", 0)
            portfolio_weight = (
                (value / total_portfolio_value * 100)
                if total_portfolio_value > 0
                else 0.0
            )

            is_new = cusip in new_cusips
            change_type = h.get("change_type", "held")
            if is_new:
                change_type = "new"

            stock_map[cusip]["holders"].append(
                {
                    "investor_name": investor_name,
                    "shares": shares,
                    "value": value,
                    "portfolio_weight": round(portfolio_weight, 2),
                    "change_type": change_type,
                    "quality_weight": _quality(investor_name),
                }
            )
            stock_map[cusip]["holder_count"] += 1
            stock_map[cusip]["total_value"] += value
            if is_new:
                stock_map[cusip]["new_position_count"] += 1

            # Prefer enrichment data if available
            if h.get("enrichment") and not stock_map[cusip].get("enrichment"):
                stock_map[cusip]["enrichment"] = h["enrichment"]
            # Prefer a resolved ticker
            if h.get("ticker") and not stock_map[cusip]["ticker"]:
                stock_map[cusip]["ticker"] = h["ticker"]

    logger.info("Aggregated %d unique stocks from all investors", len(stock_map))
    return stock_map


# ---------------------------------------------------------------------------
# Individual score components
# ---------------------------------------------------------------------------

def _consensus_score(
    stock: dict[str, Any], total_investors: int
) -> float:
    """
    Fraction of tracked investors who hold this stock, weighted by
    investor quality.  Normalised 0-100.
    """
    if total_investors == 0:
        return 0.0
    weighted_count = sum(
        h["quality_weight"] for h in stock["holders"]
    )
    # Maximum possible weighted count (if every investor held it)
    max_weighted = total_investors * 1.5  # ceiling quality
    raw = weighted_count / max_weighted * 100
    return min(raw, 100.0)


def _conviction_score(stock: dict[str, Any]) -> float:
    """
    Average portfolio weight across all holders, normalised 0-100.

    A 10 %+ average weight is considered maximum conviction.
    """
    weights = [h["portfolio_weight"] for h in stock["holders"]]
    if not weights:
        return 0.0
    avg = statistics.mean(weights)
    # Normalise: 10% avg weight -> score of 100
    return min(avg / 10.0 * 100, 100.0)


def _new_position_bonus(stock: dict[str, Any]) -> float:
    """
    Award bonus points if multiple investors opened a new position
    in the same quarter.
    """
    if stock.get("new_position_count", 0) >= NEW_POSITION_BONUS_THRESHOLD:
        return float(NEW_POSITION_BONUS_POINTS)
    # Partial credit
    count = stock.get("new_position_count", 0)
    if count > 0:
        return float(NEW_POSITION_BONUS_POINTS) * (
            count / NEW_POSITION_BONUS_THRESHOLD
        )
    return 0.0


def _momentum_alignment(stock: dict[str, Any]) -> float:
    """
    Check whether the stock's recent price trend aligns with the buying
    pattern.  If investors are buying and the price is rising, that is
    positive momentum alignment.

    Returns 0-100.
    """
    ticker = stock.get("ticker")
    if not ticker:
        return 50.0  # neutral when we can't check

    # Determine net buy/sell signal from holders
    buy_signals = 0
    sell_signals = 0
    for h in stock["holders"]:
        ct = h.get("change_type", "held")
        if ct in ("new", "increased"):
            buy_signals += 1
        elif ct in ("decreased", "exited"):
            sell_signals += 1

    if buy_signals == 0 and sell_signals == 0:
        return 50.0  # neutral

    net_signal = (buy_signals - sell_signals) / (buy_signals + sell_signals)
    # net_signal: -1 (all selling) to +1 (all buying)

    # Fetch price history
    try:
        history = get_price_history(ticker, period="3mo", interval="1wk")
        if not history or len(history) < 3:
            return 50.0

        prices = [p["close"] for p in history]
        first_half = statistics.mean(prices[: len(prices) // 2])
        second_half = statistics.mean(prices[len(prices) // 2 :])
        if first_half == 0:
            return 50.0

        price_trend = (second_half - first_half) / first_half
        # price_trend: negative = falling, positive = rising

        # Alignment: both positive or both negative
        alignment = net_signal * price_trend  # positive = aligned
        # Map to 0-100.  Perfect alignment -> 100, perfect misalignment -> 0
        score = 50 + alignment * 50 * 10  # scale factor
        return max(0.0, min(100.0, score))

    except Exception:
        logger.debug("Momentum check failed for %s", ticker)
        return 50.0


# ---------------------------------------------------------------------------
# Overall scoring
# ---------------------------------------------------------------------------

def score_stocks(
    stock_map: dict[str, dict[str, Any]],
    total_investors: int,
    *,
    compute_momentum: bool = True,
) -> list[dict[str, Any]]:
    """
    Compute all scoring components and an overall score for each stock.

    Parameters
    ----------
    stock_map : dict
        Output of :func:`aggregate_holdings`.
    total_investors : int
        Number of investors tracked (denominator for consensus).
    compute_momentum : bool
        If *False*, skip the (slow) momentum alignment calculation.

    Returns
    -------
    list
        Sorted by overall_score descending.  Each item is the stock dict
        augmented with score fields.
    """
    w = SCORING_WEIGHTS
    scored: list[dict[str, Any]] = []

    total = len(stock_map)
    for idx, (cusip, stock) in enumerate(stock_map.items(), 1):
        if idx % 100 == 0:
            logger.info("Scoring progress: %d / %d", idx, total)

        cs = _consensus_score(stock, total_investors)
        cv = _conviction_score(stock)
        npb = _new_position_bonus(stock)
        ma = (
            _momentum_alignment(stock)
            if compute_momentum
            else 50.0
        )

        overall = (
            w["consensus"] * cs
            + w["conviction"] * cv
            + w["new_position_bonus"] * npb
            + w["momentum_alignment"] * ma
        )
        overall = round(max(0.0, min(100.0, overall)), 2)

        stock["scores"] = {
            "consensus": round(cs, 2),
            "conviction": round(cv, 2),
            "new_position_bonus": round(npb, 2),
            "momentum_alignment": round(ma, 2),
            "overall": overall,
        }
        scored.append(stock)

    scored.sort(key=lambda s: s["scores"]["overall"], reverse=True)
    logger.info("Scoring complete for %d stocks", len(scored))
    return scored


# ---------------------------------------------------------------------------
# Top picks & sell signals
# ---------------------------------------------------------------------------

def identify_top_picks(
    scored_stocks: list[dict[str, Any]], top_n: int = 20
) -> list[dict[str, Any]]:
    """Return the top-N highest-scoring stocks."""
    return scored_stocks[:top_n]


def identify_sell_signals(
    all_investor_holdings: list[dict[str, Any]],
    min_exits: int = 3,
) -> list[dict[str, Any]]:
    """
    Identify stocks being exited by multiple investors.

    Parameters
    ----------
    all_investor_holdings : list
        Same structure as the input to :func:`aggregate_holdings`.
    min_exits : int
        Minimum number of investors exiting for it to be a signal.

    Returns
    -------
    list
        Each item has ``cusip``, ``nameOfIssuer``, ``exiting_investors``,
        ``exit_count``.
    """
    exit_map: dict[str, dict[str, Any]] = {}

    for inv in all_investor_holdings:
        investor_name = inv.get("investor_name", "Unknown")
        changes = inv.get("changes", {})
        for h in changes.get("exited", []):
            cusip = h.get("cusip", "")
            if not cusip:
                continue
            if cusip not in exit_map:
                exit_map[cusip] = {
                    "cusip": cusip,
                    "nameOfIssuer": h.get("nameOfIssuer", ""),
                    "ticker": h.get("ticker", ""),
                    "exiting_investors": [],
                    "exit_count": 0,
                }
            exit_map[cusip]["exiting_investors"].append(investor_name)
            exit_map[cusip]["exit_count"] += 1

    signals = [
        v for v in exit_map.values() if v["exit_count"] >= min_exits
    ]
    signals.sort(key=lambda s: s["exit_count"], reverse=True)
    logger.info("Identified %d sell signals (>=%d exits)", len(signals), min_exits)
    return signals
