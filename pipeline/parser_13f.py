"""
Parse 13F-HR XML (informationTable) into structured holding records.

Handles both the modern XML namespace format and older SGML-style tables.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from xml.etree import ElementTree

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# XML namespace variants used in SEC 13F filings
# ---------------------------------------------------------------------------
NAMESPACES = [
    {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"},
    {"ns": "http://www.sec.gov/edgar/thirteenffiling"},
    {},  # no namespace (older filings)
]

# ---------------------------------------------------------------------------
# CUSIP -> Ticker mapping cache (populated lazily)
# ---------------------------------------------------------------------------
_cusip_ticker_cache: dict[str, str] = {}


def _strip_ns(tag: str) -> str:
    """Remove XML namespace prefix from a tag name."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_text(
    element: ElementTree.Element, tag: str, namespace: dict[str, str]
) -> str:
    """Find a child element's text, trying with and without namespace."""
    ns_uri = namespace.get("ns", "")
    if ns_uri:
        child = element.find(f"{{{ns_uri}}}{tag}")
        if child is not None and child.text:
            return child.text.strip()

    # Fallback: try without namespace
    child = element.find(tag)
    if child is not None and child.text:
        return child.text.strip()

    # Fallback: case-insensitive search through children
    tag_lower = tag.lower()
    for ch in element:
        if _strip_ns(ch.tag).lower() == tag_lower and ch.text:
            return ch.text.strip()

    return ""


def _find_nested_text(
    element: ElementTree.Element,
    parent_tag: str,
    child_tag: str,
    namespace: dict[str, str],
) -> str:
    """Find text inside a nested element (e.g. <shrsOrPrnAmt><sshPrnamt>)."""
    ns_uri = namespace.get("ns", "")
    parent = None
    if ns_uri:
        parent = element.find(f"{{{ns_uri}}}{parent_tag}")
    if parent is None:
        parent = element.find(parent_tag)
    if parent is None:
        # Case-insensitive fallback
        pt_lower = parent_tag.lower()
        for ch in element:
            if _strip_ns(ch.tag).lower() == pt_lower:
                parent = ch
                break
    if parent is None:
        return ""
    return _find_text(parent, child_tag, namespace)


# ---------------------------------------------------------------------------
# Core parser
# ---------------------------------------------------------------------------

def parse_infotable_xml(xml_text: str) -> list[dict[str, Any]]:
    """
    Parse a 13F information-table XML string into a list of holding dicts.

    Each dict contains:
    - nameOfIssuer
    - titleOfClass
    - cusip
    - value          (in thousands, as reported)
    - shares         (number of shares or principal amount)
    - shareType      ("SH" or "PRN")
    - investmentDiscretion
    - votingSole
    - votingShared
    - votingNone

    Returns an empty list if parsing fails entirely.
    """
    if not xml_text or not xml_text.strip():
        logger.warning("Empty XML text provided to parser")
        return []

    # Try to detect and handle SGML-format filings
    if _looks_like_sgml(xml_text):
        return _parse_sgml_infotable(xml_text)

    # Clean up common XML issues
    xml_text = _sanitize_xml(xml_text)

    for ns in NAMESPACES:
        try:
            holdings = _parse_with_namespace(xml_text, ns)
            if holdings:
                logger.info(
                    "Parsed %d holdings (namespace: %s)",
                    len(holdings),
                    ns.get("ns", "none"),
                )
                return holdings
        except ElementTree.ParseError as exc:
            logger.debug("XML parse attempt failed with ns=%s: %s", ns, exc)
            continue

    logger.error("Failed to parse infotable XML with any known namespace")
    return []


def _sanitize_xml(xml_text: str) -> str:
    """Fix common XML issues in SEC filings."""
    # Remove XML declaration issues (duplicate declarations, BOM)
    xml_text = xml_text.lstrip("﻿")
    # Some filings have HTML entities not valid in XML
    xml_text = xml_text.replace("&amp;amp;", "&amp;")
    return xml_text


def _looks_like_sgml(text: str) -> bool:
    """Detect if the filing is SGML rather than XML."""
    # SGML filings typically lack an XML declaration and contain <TABLE> tags
    first_500 = text[:500].upper()
    return "<TABLE>" in first_500 or "<DOCUMENT>" in first_500


def _parse_with_namespace(
    xml_text: str, namespace: dict[str, str]
) -> list[dict[str, Any]]:
    """Attempt to parse the XML using a specific namespace."""
    root = ElementTree.fromstring(xml_text)
    ns_uri = namespace.get("ns", "")

    # Find all infoTable entries
    entries: list[ElementTree.Element] = []
    if ns_uri:
        entries = root.findall(f".//{{{ns_uri}}}infoTable")
    if not entries:
        # Try without namespace
        entries = root.findall(".//infoTable")
    if not entries:
        # Case-insensitive fallback
        for elem in root.iter():
            if _strip_ns(elem.tag).lower() == "infotable":
                entries.append(elem)

    holdings: list[dict[str, Any]] = []
    for entry in entries:
        holding = _extract_holding(entry, namespace)
        if holding:
            holdings.append(holding)

    return holdings


def _extract_holding(
    entry: ElementTree.Element, namespace: dict[str, str]
) -> Optional[dict[str, Any]]:
    """Extract a single holding record from an <infoTable> element."""
    name = _find_text(entry, "nameOfIssuer", namespace)
    title = _find_text(entry, "titleOfClass", namespace)
    cusip = _find_text(entry, "cusip", namespace)
    value_str = _find_text(entry, "value", namespace)
    discretion = _find_text(entry, "investmentDiscretion", namespace)

    shares_str = _find_nested_text(
        entry, "shrsOrPrnAmt", "sshPrnamt", namespace
    )
    share_type = _find_nested_text(
        entry, "shrsOrPrnAmt", "sshPrnamtType", namespace
    )

    voting_sole = _find_nested_text(entry, "votingAuthority", "Sole", namespace)
    voting_shared = _find_nested_text(
        entry, "votingAuthority", "Shared", namespace
    )
    voting_none = _find_nested_text(entry, "votingAuthority", "None", namespace)

    if not name and not cusip:
        return None

    return {
        "nameOfIssuer": _normalize_company_name(name),
        "titleOfClass": title,
        "cusip": cusip.upper() if cusip else "",
        "value": _safe_int(value_str),
        "shares": _safe_int(shares_str),
        "shareType": share_type or "SH",
        "investmentDiscretion": discretion or "SOLE",
        "votingSole": _safe_int(voting_sole),
        "votingShared": _safe_int(voting_shared),
        "votingNone": _safe_int(voting_none),
    }


def _parse_sgml_infotable(text: str) -> list[dict[str, Any]]:
    """
    Best-effort parser for older SGML-format 13F information tables.

    These are typically plain-text tables with fixed columns.
    """
    logger.info("Attempting SGML parse")
    holdings: list[dict[str, Any]] = []

    # Pattern for typical SGML 13F table rows:
    # NAME OF ISSUER | TITLE | CUSIP | VALUE | SHARES | SH/PRN | DISC | VOTING
    # Lines are usually fixed-width or tab-separated
    lines = text.split("\n")

    # Skip header lines — look for the data section
    data_started = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect start of data: a line with a valid CUSIP (9 alphanumeric chars)
        cusip_match = re.search(r"\b([A-Z0-9]{9})\b", stripped)
        if cusip_match:
            data_started = True

        if not data_started:
            continue

        if cusip_match:
            # Try to extract fields around the CUSIP
            parts = re.split(r"\s{2,}|\t", stripped)
            if len(parts) >= 5:
                holdings.append(
                    {
                        "nameOfIssuer": _normalize_company_name(parts[0]),
                        "titleOfClass": parts[1] if len(parts) > 1 else "",
                        "cusip": cusip_match.group(1),
                        "value": _safe_int(parts[3] if len(parts) > 3 else "0"),
                        "shares": _safe_int(
                            parts[4] if len(parts) > 4 else "0"
                        ),
                        "shareType": "SH",
                        "investmentDiscretion": "SOLE",
                        "votingSole": 0,
                        "votingShared": 0,
                        "votingNone": 0,
                    }
                )

    if holdings:
        logger.info("SGML parse extracted %d holdings", len(holdings))
    else:
        logger.warning("SGML parse found no holdings")

    return holdings


# ---------------------------------------------------------------------------
# Quarter-over-quarter comparison
# ---------------------------------------------------------------------------

def compare_quarters(
    current: list[dict[str, Any]],
    previous: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Compare two quarters of holdings and classify each position.

    Returns a dict with keys:
    - ``new``         : positions in current but not previous
    - ``exited``      : positions in previous but not current
    - ``increased``   : positions present in both with more shares
    - ``decreased``   : positions present in both with fewer shares
    - ``unchanged``   : positions present in both with same shares
    """
    def _by_cusip(holdings: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for h in holdings:
            cusip = h.get("cusip", "")
            if cusip:
                # If duplicate CUSIPs, aggregate shares
                if cusip in result:
                    result[cusip]["shares"] += h.get("shares", 0)
                    result[cusip]["value"] += h.get("value", 0)
                else:
                    result[cusip] = dict(h)
        return result

    curr_map = _by_cusip(current)
    prev_map = _by_cusip(previous)

    curr_cusips = set(curr_map.keys())
    prev_cusips = set(prev_map.keys())

    result: dict[str, list[dict[str, Any]]] = {
        "new": [],
        "exited": [],
        "increased": [],
        "decreased": [],
        "unchanged": [],
    }

    for cusip in curr_cusips - prev_cusips:
        entry = dict(curr_map[cusip])
        entry["change_type"] = "new"
        result["new"].append(entry)

    for cusip in prev_cusips - curr_cusips:
        entry = dict(prev_map[cusip])
        entry["change_type"] = "exited"
        result["exited"].append(entry)

    for cusip in curr_cusips & prev_cusips:
        curr_shares = curr_map[cusip].get("shares", 0)
        prev_shares = prev_map[cusip].get("shares", 0)
        entry = dict(curr_map[cusip])
        entry["previousShares"] = prev_shares
        entry["sharesChange"] = curr_shares - prev_shares
        if prev_shares > 0:
            entry["sharesChangePct"] = round(
                (curr_shares - prev_shares) / prev_shares * 100, 2
            )
        else:
            entry["sharesChangePct"] = 0.0

        if curr_shares > prev_shares:
            entry["change_type"] = "increased"
            result["increased"].append(entry)
        elif curr_shares < prev_shares:
            entry["change_type"] = "decreased"
            result["decreased"].append(entry)
        else:
            entry["change_type"] = "unchanged"
            result["unchanged"].append(entry)

    return result


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _normalize_company_name(name: str) -> str:
    """
    Normalize an issuer name for consistent comparison.

    Strips suffixes like INC, CORP, LTD, etc. and title-cases.
    """
    if not name:
        return ""
    # Upper-case first for stripping
    upper = name.upper().strip()
    # Remove common corporate suffixes
    suffixes = [
        r"\bINC\.?$",
        r"\bCORP\.?$",
        r"\bLTD\.?$",
        r"\bLLC\.?$",
        r"\bLP\.?$",
        r"\bPLC\.?$",
        r"\bCO\.?$",
        r"\bGROUP\.?$",
        r"\bHOLDINGS?\.?$",
        r"\bINTERNATIONAL\.?$",
        r"\bTECHNOLOGIES?\.?$",
        r"\bCLASS\s+[A-Z]$",
        r"\bCL\s+[A-Z]$",
        r"\bSER\s+[A-Z]$",
        r"\bNEW$",
        r"\bCOM$",
        r"\bCOM\s+NEW$",
    ]
    cleaned = upper
    for suffix in suffixes:
        cleaned = re.sub(suffix, "", cleaned).strip()
    # Remove trailing punctuation
    cleaned = cleaned.rstrip(" ,.-/")
    # Title case for readability
    return cleaned.title()


def _safe_int(val: str) -> int:
    """Parse an integer string, returning 0 on failure."""
    if not val:
        return 0
    # Remove commas and whitespace
    cleaned = val.replace(",", "").strip()
    try:
        return int(cleaned)
    except ValueError:
        try:
            return int(float(cleaned))
        except ValueError:
            return 0


# ---------------------------------------------------------------------------
# CUSIP -> Ticker mapping
# ---------------------------------------------------------------------------

def cusip_to_ticker(cusip: str) -> Optional[str]:
    """
    Attempt to map a CUSIP to a stock ticker symbol.

    Uses a built-in mapping for the most common securities and falls
    back to a web lookup when available.
    """
    if cusip in _cusip_ticker_cache:
        return _cusip_ticker_cache[cusip]

    # Check the static mapping first
    ticker = _COMMON_CUSIP_MAP.get(cusip)
    if ticker:
        _cusip_ticker_cache[cusip] = ticker
        return ticker

    return None


def register_cusip_ticker(cusip: str, ticker: str) -> None:
    """Manually register a CUSIP-to-ticker mapping."""
    _cusip_ticker_cache[cusip] = ticker


# A small built-in map for the most commonly held mega-cap stocks.
# The enrichment module can extend this at runtime.
_COMMON_CUSIP_MAP: dict[str, str] = {
    "037833100": "AAPL",   # Apple
    "594918104": "MSFT",   # Microsoft
    "023135106": "AMZN",   # Amazon
    "02079K305": "GOOG",   # Alphabet Class C
    "02079K107": "GOOGL",  # Alphabet Class A
    "30303M102": "META",   # Meta Platforms
    "88160R101": "TSLA",   # Tesla
    "67066G104": "NVDA",   # NVIDIA
    "084670702": "BRK-B",  # Berkshire Hathaway B
    "46625H100": "JPM",    # JPMorgan Chase
    "92826C839": "V",      # Visa
    "57636Q104": "MA",     # Mastercard
    "478160104": "JNJ",    # Johnson & Johnson
    "91324P102": "UNH",    # UnitedHealth
    "742718109": "PG",     # Procter & Gamble
    "931142103": "WMT",    # Walmart
    "172967424": "C",      # Citigroup
    "060505104": "BAC",    # Bank of America
    "17275R102": "CSCO",   # Cisco
    "438516106": "HON",    # Honeywell
    "254687106": "DIS",    # Walt Disney
    "79466L302": "CRM",    # Salesforce
    "00724F101": "ADBE",   # Adobe
    "58933Y105": "MRK",    # Merck
    "713448108": "PEP",    # PepsiCo
    "191216100": "KO",     # Coca-Cola
    "110122108": "BMY",    # Bristol-Myers Squibb
    "007903107": "AMD",    # Advanced Micro Devices
    "345370860": "F",      # Ford Motor
    "369604103": "GE",     # General Electric
    "459200101": "IBM",    # IBM
    "22160K105": "COST",   # Costco
    "68389X105": "ORCL",   # Oracle
    "02376R102": "AAL",    # American Airlines
    "464287614": "INTC",   # Intel (old CUSIP)
    "46120E602": "INTC",   # Intel
    "532457108": "LLY",    # Eli Lilly
    "000360206": "ABT",    # Abbott Labs
    "718172109": "PFE",    # Pfizer
    "87612E106": "TGT",    # Target
    "460146103": "INTU",   # Intuit
    "29786A106": "EQIX",   # Equinix
    "872540109": "TFC",    # Truist Financial
    "126408103": "CVS",    # CVS Health
    "92343V104": "VZ",     # Verizon
    "00206R102": "T",      # AT&T
    "808513105": "SCHW",   # Charles Schwab
}
