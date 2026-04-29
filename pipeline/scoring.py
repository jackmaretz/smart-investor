"""
Scoring engine for the Smart Investor pipeline.

Computes per-stock scores using five components:
1. Consensus — how many quality investors hold the stock
2. Conviction — average portfolio weight among holders
3. Fundamental — P/E, revenue growth, profit margin
4. Price-value — where current price sits vs 52-week range
5. New position bonus — multiple investors opening new positions

Designed for a long-term buy-and-hold strategy.
"""

from __future__ import annotations

import logging
import statistics
from typing import Any

from config import (
    NEW_POSITION_BONUS_POINTS,
    NEW_POSITION_BONUS_THRESHOLD,
    SCORING_WEIGHTS,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Investor quality weights
# ---------------------------------------------------------------------------
_INVESTOR_QUALITY: dict[str, float] = {
    "Warren Buffett": 1.5,
    "Stanley Druckenmiller": 1.4,
    "Seth Klarman": 1.4,
    "Li Lu": 1.3,
    "Joel Greenblatt": 1.3,
    "Michael Burry": 1.1,
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
    "Christopher Davis": 1.2,
    "Frank Sands": 1.1,
    "Steve Mandel": 1.1,
    "Lee Ainslie": 1.0,
    "Bill Miller": 1.0,
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
    """
    stock_map: dict[str, dict[str, Any]] = {}

    for inv in all_investor_holdings:
        investor_name = inv.get("investor_name", "Unknown")
        holdings = inv.get("holdings", [])
        changes = inv.get("changes", {})

        new_cusips: set[str] = set()
        if changes:
            for h in changes.get("new", []):
                c = h.get("cusip", "")
                if c:
                    new_cusips.add(c)

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

            if h.get("enrichment") and not stock_map[cusip].get("enrichment"):
                stock_map[cusip]["enrichment"] = h["enrichment"]
            if h.get("ticker") and not stock_map[cusip]["ticker"]:
                stock_map[cusip]["ticker"] = h["ticker"]

    logger.info("Aggregated %d unique stocks from all investors", len(stock_map))
    return stock_map


# ---------------------------------------------------------------------------
# Score components
# ---------------------------------------------------------------------------

def _consensus_score(stock: dict[str, Any], total_investors: int) -> float:
    """Weighted fraction of tracked investors holding this stock. 0-100."""
    if total_investors == 0:
        return 0.0
    weighted_count = sum(h["quality_weight"] for h in stock["holders"])
    max_weighted = total_investors * 1.5
    raw = weighted_count / max_weighted * 100
    return min(raw, 100.0)


def _conviction_score(stock: dict[str, Any]) -> float:
    """
    Average portfolio weight across holders, normalised 0-100.
    Ceiling at 20% (was 10% — too low for concentrated portfolios).
    """
    weights = [h["portfolio_weight"] for h in stock["holders"]]
    if not weights:
        return 0.0
    avg = statistics.mean(weights)
    return min(avg / 20.0 * 100, 100.0)


def _fundamental_score(stock: dict[str, Any]) -> float:
    """
    Score based on financial health. Components:
    - P/E ratio: 5-25 is ideal (score 80-100), <5 or >50 penalised
    - Revenue growth: positive = good, >15% = great
    - Profit margin: positive = good, >20% = great
    Returns 0-100. Returns 50 (neutral) if no data available.
    """
    enr = stock.get("enrichment")
    if not enr:
        return 50.0

    sub_scores: list[float] = []

    # P/E ratio scoring
    pe = enr.get("peRatio")
    if pe is not None and pe != 0:
        if pe < 0:
            sub_scores.append(15.0)  # Loss-making company
        elif pe < 5:
            sub_scores.append(40.0)  # Suspiciously cheap or cyclical trough
        elif pe <= 15:
            sub_scores.append(95.0)  # Value sweet spot
        elif pe <= 25:
            sub_scores.append(80.0)  # Reasonable
        elif pe <= 40:
            sub_scores.append(55.0)  # Expensive, needs growth to justify
        elif pe <= 60:
            sub_scores.append(35.0)  # Very expensive
        else:
            sub_scores.append(20.0)  # Extreme valuation
    else:
        sub_scores.append(50.0)

    # Revenue growth scoring
    rev_growth = enr.get("revenueGrowthYoY") or enr.get("revenueGrowth")
    if rev_growth is not None:
        if rev_growth > 0.30:
            sub_scores.append(95.0)
        elif rev_growth > 0.15:
            sub_scores.append(85.0)
        elif rev_growth > 0.05:
            sub_scores.append(70.0)
        elif rev_growth > 0:
            sub_scores.append(55.0)
        elif rev_growth > -0.10:
            sub_scores.append(35.0)
        else:
            sub_scores.append(15.0)  # Shrinking revenue
    else:
        sub_scores.append(50.0)

    # Profit margin scoring
    margin = enr.get("profitMargin")
    if margin is not None:
        if margin > 0.25:
            sub_scores.append(95.0)
        elif margin > 0.15:
            sub_scores.append(80.0)
        elif margin > 0.05:
            sub_scores.append(60.0)
        elif margin > 0:
            sub_scores.append(45.0)
        else:
            sub_scores.append(20.0)  # Unprofitable
    else:
        sub_scores.append(50.0)

    return statistics.mean(sub_scores) if sub_scores else 50.0


def _price_value_score(stock: dict[str, Any]) -> float:
    """
    Where is the current price relative to the 52-week range?
    Closer to 52w low = higher score (potential value).
    Closer to 52w high = lower score (less upside).
    For a long-term strategy, buying near lows is preferred.
    Returns 0-100. 50 if no data.
    """
    enr = stock.get("enrichment")
    if not enr:
        return 50.0

    price = enr.get("currentPrice")
    high = enr.get("fiftyTwoWeekHigh") or enr.get("high52w")
    low = enr.get("fiftyTwoWeekLow") or enr.get("low52w")

    if not price or not high or not low or high == low:
        return 50.0

    # Position in range: 0 = at low, 1 = at high
    position = (price - low) / (high - low)
    position = max(0.0, min(1.0, position))

    # Invert: closer to low = higher score
    # But don't reward stocks in freefall — if >30% below high, moderate the score
    raw_score = (1.0 - position) * 100

    # Penalty if the stock dropped too much (>40% from high = distress signal)
    drop_pct = (high - price) / high
    if drop_pct > 0.40:
        raw_score *= 0.6  # Penalise distressed stocks

    return max(0.0, min(100.0, raw_score))


def _new_position_bonus(stock: dict[str, Any]) -> float:
    """Award bonus if multiple investors opened new position same quarter."""
    count = stock.get("new_position_count", 0)
    if count >= NEW_POSITION_BONUS_THRESHOLD:
        return float(NEW_POSITION_BONUS_POINTS)
    if count > 0:
        return float(NEW_POSITION_BONUS_POINTS) * (count / NEW_POSITION_BONUS_THRESHOLD)
    return 0.0


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
    Compute all scoring components and overall score for each stock.
    Returns list sorted by overall_score descending.
    """
    w = SCORING_WEIGHTS
    scored: list[dict[str, Any]] = []

    total = len(stock_map)
    for idx, (cusip, stock) in enumerate(stock_map.items(), 1):
        if idx % 500 == 0:
            logger.info("Scoring progress: %d / %d", idx, total)

        cs = _consensus_score(stock, total_investors)
        cv = _conviction_score(stock)
        fs = _fundamental_score(stock)
        pv = _price_value_score(stock)
        npb = _new_position_bonus(stock)

        overall = (
            w["consensus"] * cs
            + w["conviction"] * cv
            + w["fundamental"] * fs
            + w["price_value"] * pv
            + w["new_position_bonus"] * npb
        )
        overall = round(max(0.0, min(100.0, overall)), 2)

        stock["scores"] = {
            "consensus": round(cs, 2),
            "conviction": round(cv, 2),
            "fundamental": round(fs, 2),
            "price_value": round(pv, 2),
            "new_position_bonus": round(npb, 2),
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
    """
    Return top-N stocks that pass minimum quality filters:
    - At least 3 holders
    - Fundamental score >= 40 (not loss-making with bad metrics)
    - Overall score >= 30
    Falls back to pure score ranking if filters are too restrictive.
    """
    filtered = [
        s for s in scored_stocks
        if s.get("holder_count", 0) >= 3
        and s.get("scores", {}).get("fundamental", 50) >= 40
        and s.get("scores", {}).get("overall", 0) >= 30
    ]
    if len(filtered) < top_n:
        filtered = scored_stocks
    return filtered[:top_n]


def identify_sell_signals(
    all_investor_holdings: list[dict[str, Any]],
    scored_stocks: list[dict[str, Any]] | None = None,
    min_exits: int = 2,
) -> list[dict[str, Any]]:
    """
    Identify stocks to sell/avoid. Combines:
    1. Multiple investors exiting (classic signal)
    2. Deteriorating fundamentals (low fundamental score)
    3. Stocks near 52-week highs with many sellers (distribution)
    """
    # Build score lookup
    score_lookup: dict[str, dict[str, Any]] = {}
    if scored_stocks:
        for s in scored_stocks:
            cusip = s.get("cusip", "")
            if cusip:
                score_lookup[cusip] = s.get("scores", {})

    # Collect exits
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

    signals: list[dict[str, Any]] = []
    for cusip, info in exit_map.items():
        if info["exit_count"] < min_exits:
            continue

        scores = score_lookup.get(cusip, {})
        fundamental = scores.get("fundamental", 50)
        price_value = scores.get("price_value", 50)

        # Severity: more exits + bad fundamentals + near highs = stronger signal
        severity = info["exit_count"] * 10
        if fundamental < 40:
            severity += 20  # Bad fundamentals amplify signal
        if price_value < 30:
            severity += 10  # Near 52w high (low price_value = near high)

        info["severity"] = severity
        info["fundamental_score"] = fundamental
        info["price_value_score"] = price_value
        info["overall_score"] = scores.get("overall", 0)
        signals.append(info)

    signals.sort(key=lambda s: s["severity"], reverse=True)
    logger.info("Identified %d sell signals (>=%d exits)", len(signals), min_exits)
    return signals
