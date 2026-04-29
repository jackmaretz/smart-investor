"""
Configuration constants for the Smart Investor pipeline.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PIPELINE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PIPELINE_DIR.parent
DATA_OUTPUT_DIR = PROJECT_ROOT / "data"
FRONTEND_DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
CACHE_DIR = PIPELINE_DIR / ".cache"
INVESTORS_FILE = PIPELINE_DIR / "investors.json"

# ---------------------------------------------------------------------------
# SEC EDGAR
# ---------------------------------------------------------------------------
SEC_EDGAR_BASE_URL = "https://data.sec.gov"
SEC_EDGAR_FULL_TEXT = "https://efts.sec.gov/LATEST"
SEC_EDGAR_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
USER_AGENT = "SmartInvestor giacomomaretto@gmail.com"

# SEC asks for a maximum of 10 requests per second.
# We stay safely under that ceiling.
SEC_RATE_LIMIT_RPS = 10
SEC_REQUEST_INTERVAL = 1.0 / SEC_RATE_LIMIT_RPS  # seconds between requests
SEC_MAX_RETRIES = 3
SEC_BACKOFF_FACTOR = 2  # exponential back-off multiplier

# ---------------------------------------------------------------------------
# yfinance / enrichment
# ---------------------------------------------------------------------------
YFINANCE_CACHE_TTL_HOURS = 24  # hours before re-fetching ticker data

# ---------------------------------------------------------------------------
# Scoring weights (must sum to 1.0)
# Tuned for long-term buy-and-hold strategy.
# ---------------------------------------------------------------------------
SCORING_WEIGHTS = {
    "consensus": 0.25,
    "conviction": 0.25,
    "fundamental": 0.25,
    "price_value": 0.15,
    "new_position_bonus": 0.10,
}
NEW_POSITION_BONUS_THRESHOLD = 3
NEW_POSITION_BONUS_POINTS = 15

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
