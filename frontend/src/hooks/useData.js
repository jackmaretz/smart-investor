import { useState, useEffect, useMemo, useCallback } from 'react';

// ---------- SAMPLE DATA ----------
const SAMPLE_SUMMARY = {
  metadata: {
    last_updated: "2025-01-15T10:30:00",
    quarter: "Q4-2024",
    investors_analyzed: 47,
    unique_holdings: 850,
    total_portfolio_value: 2500000000000
  },
  top_picks: [
    { ticker: "AAPL", company: "Apple Inc", overall_score: 92.5, consensus_score: 88, conviction_score: 82, investors_holding: 35, avg_portfolio_weight: 5.8, sector: "Technology", market_cap_category: "Mega", price: 195.50, pe_ratio: 28.5, revenue_growth: 0.08, is_new_position_cluster: false },
    { ticker: "MSFT", company: "Microsoft Corp", overall_score: 90.1, consensus_score: 86, conviction_score: 79, investors_holding: 33, avg_portfolio_weight: 5.1, sector: "Technology", market_cap_category: "Mega", price: 415.20, pe_ratio: 35.2, revenue_growth: 0.13, is_new_position_cluster: false },
    { ticker: "AMZN", company: "Amazon.com Inc", overall_score: 87.3, consensus_score: 82, conviction_score: 74, investors_holding: 30, avg_portfolio_weight: 4.5, sector: "Consumer Cyclical", market_cap_category: "Mega", price: 185.60, pe_ratio: 60.1, revenue_growth: 0.12, is_new_position_cluster: false },
    { ticker: "GOOGL", company: "Alphabet Inc", overall_score: 85.8, consensus_score: 80, conviction_score: 72, investors_holding: 28, avg_portfolio_weight: 4.1, sector: "Technology", market_cap_category: "Mega", price: 141.80, pe_ratio: 23.4, revenue_growth: 0.11, is_new_position_cluster: false },
    { ticker: "UNH", company: "UnitedHealth Group", overall_score: 83.4, consensus_score: 78, conviction_score: 76, investors_holding: 25, avg_portfolio_weight: 3.8, sector: "Healthcare", market_cap_category: "Mega", price: 528.40, pe_ratio: 21.0, revenue_growth: 0.14, is_new_position_cluster: false },
    { ticker: "META", company: "Meta Platforms Inc", overall_score: 81.2, consensus_score: 75, conviction_score: 70, investors_holding: 24, avg_portfolio_weight: 3.5, sector: "Technology", market_cap_category: "Mega", price: 390.10, pe_ratio: 26.8, revenue_growth: 0.23, is_new_position_cluster: false },
    { ticker: "NVDA", company: "NVIDIA Corp", overall_score: 80.6, consensus_score: 74, conviction_score: 68, investors_holding: 22, avg_portfolio_weight: 3.2, sector: "Technology", market_cap_category: "Mega", price: 495.30, pe_ratio: 65.4, revenue_growth: 1.22, is_new_position_cluster: true },
    { ticker: "LLY", company: "Eli Lilly & Co", overall_score: 78.9, consensus_score: 72, conviction_score: 71, investors_holding: 20, avg_portfolio_weight: 2.9, sector: "Healthcare", market_cap_category: "Mega", price: 620.80, pe_ratio: 105.2, revenue_growth: 0.20, is_new_position_cluster: true },
    { ticker: "V", company: "Visa Inc", overall_score: 77.5, consensus_score: 70, conviction_score: 67, investors_holding: 19, avg_portfolio_weight: 2.6, sector: "Financial Services", market_cap_category: "Mega", price: 279.50, pe_ratio: 30.1, revenue_growth: 0.11, is_new_position_cluster: false },
    { ticker: "JPM", company: "JPMorgan Chase & Co", overall_score: 76.2, consensus_score: 68, conviction_score: 65, investors_holding: 18, avg_portfolio_weight: 2.4, sector: "Financial Services", market_cap_category: "Mega", price: 198.30, pe_ratio: 11.8, revenue_growth: 0.09, is_new_position_cluster: false }
  ],
  sell_signals: [
    { ticker: "PYPL", company: "PayPal Holdings", overall_score: 25.3, investors_selling: 8, avg_reduction: -32.5, sector: "Financial Services" },
    { ticker: "DIS", company: "Walt Disney Co", overall_score: 30.1, investors_selling: 6, avg_reduction: -18.2, sector: "Communication Services" },
    { ticker: "BA", company: "Boeing Co", overall_score: 22.8, investors_selling: 5, avg_reduction: -45.0, sector: "Industrials" }
  ],
  new_position_clusters: [
    { ticker: "NVDA", company: "NVIDIA Corp", investors_entering: 8, avg_initial_weight: 2.1, sector: "Technology" },
    { ticker: "LLY", company: "Eli Lilly & Co", investors_entering: 6, avg_initial_weight: 1.8, sector: "Healthcare" },
    { ticker: "PANW", company: "Palo Alto Networks", investors_entering: 4, avg_initial_weight: 1.2, sector: "Technology" },
    { ticker: "CRWD", company: "CrowdStrike Holdings", investors_entering: 3, avg_initial_weight: 0.9, sector: "Technology" }
  ],
  sector_distribution: {
    "Technology": 38.5,
    "Healthcare": 14.2,
    "Financial Services": 12.8,
    "Consumer Cyclical": 10.1,
    "Communication Services": 7.5,
    "Industrials": 6.3,
    "Consumer Defensive": 4.2,
    "Energy": 3.1,
    "Altro": 3.3
  },
  stats: {
    avg_score: 45.2,
    median_score: 42.0,
    top_10_avg: 83.4
  }
};

const SAMPLE_HOLDINGS = {
  holdings: [
    {
      ticker: "AAPL", company: "Apple Inc", cusip: "037833100", sector: "Technology", industry: "Consumer Electronics",
      market_cap_category: "Mega", market_cap: 3050000000000, price: 195.50, pe_ratio: 28.5, revenue_growth: 0.08,
      profit_margin: 0.26, high_52w: 199.62, low_52w: 164.08,
      overall_score: 92.5, consensus_score: 88, conviction_score: 82, momentum_score: 75, new_position_bonus: 0,
      investors_holding: 35, total_investors: 47, avg_portfolio_weight: 5.8, total_value_held: 185000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Warren Buffett", fund: "Berkshire Hathaway Inc", shares: 915000000, value: 178882500000, portfolio_weight: 48.5, change_type: "decreased", shares_change_pct: -1.2 },
        { investor_name: "Seth Klarman", fund: "Baupost Group", shares: 45000000, value: 8797500000, portfolio_weight: 8.2, change_type: "increased", shares_change_pct: 5.3 },
        { investor_name: "David Tepper", fund: "Appaloosa Management", shares: 22000000, value: 4301000000, portfolio_weight: 6.1, change_type: "unchanged", shares_change_pct: 0 }
      ]
    },
    {
      ticker: "MSFT", company: "Microsoft Corp", cusip: "594918104", sector: "Technology", industry: "Software",
      market_cap_category: "Mega", market_cap: 3100000000000, price: 415.20, pe_ratio: 35.2, revenue_growth: 0.13,
      profit_margin: 0.35, high_52w: 420.82, low_52w: 309.45,
      overall_score: 90.1, consensus_score: 86, conviction_score: 79, momentum_score: 72, new_position_bonus: 0,
      investors_holding: 33, total_investors: 47, avg_portfolio_weight: 5.1, total_value_held: 162000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Terry Smith", fund: "Fundsmith", shares: 35000000, value: 14532000000, portfolio_weight: 12.1, change_type: "increased", shares_change_pct: 3.8 },
        { investor_name: "Chris Hohn", fund: "TCI Fund Management", shares: 28000000, value: 11625600000, portfolio_weight: 9.5, change_type: "increased", shares_change_pct: 2.1 }
      ]
    },
    {
      ticker: "AMZN", company: "Amazon.com Inc", cusip: "023135106", sector: "Consumer Cyclical", industry: "E-Commerce",
      market_cap_category: "Mega", market_cap: 1920000000000, price: 185.60, pe_ratio: 60.1, revenue_growth: 0.12,
      profit_margin: 0.07, high_52w: 189.77, low_52w: 118.35,
      overall_score: 87.3, consensus_score: 82, conviction_score: 74, momentum_score: 70, new_position_bonus: 0,
      investors_holding: 30, total_investors: 47, avg_portfolio_weight: 4.5, total_value_held: 140000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Chase Coleman", fund: "Tiger Global", shares: 42000000, value: 7795200000, portfolio_weight: 11.2, change_type: "increased", shares_change_pct: 8.5 },
        { investor_name: "Philippe Laffont", fund: "Coatue Management", shares: 31000000, value: 5753600000, portfolio_weight: 7.8, change_type: "increased", shares_change_pct: 4.2 }
      ]
    },
    {
      ticker: "GOOGL", company: "Alphabet Inc", cusip: "02079K305", sector: "Technology", industry: "Internet",
      market_cap_category: "Mega", market_cap: 1780000000000, price: 141.80, pe_ratio: 23.4, revenue_growth: 0.11,
      profit_margin: 0.24, high_52w: 153.78, low_52w: 115.83,
      overall_score: 85.8, consensus_score: 80, conviction_score: 72, momentum_score: 68, new_position_bonus: 0,
      investors_holding: 28, total_investors: 47, avg_portfolio_weight: 4.1, total_value_held: 125000000000,
      quarter_change: "unchanged",
      holders: [
        { investor_name: "David Tepper", fund: "Appaloosa Management", shares: 50000000, value: 7090000000, portfolio_weight: 10.1, change_type: "increased", shares_change_pct: 12.0 },
        { investor_name: "Bill Ackman", fund: "Pershing Square", shares: 18000000, value: 2552400000, portfolio_weight: 6.5, change_type: "new", shares_change_pct: 100 }
      ]
    },
    {
      ticker: "UNH", company: "UnitedHealth Group", cusip: "91324P102", sector: "Healthcare", industry: "Health Insurance",
      market_cap_category: "Mega", market_cap: 488000000000, price: 528.40, pe_ratio: 21.0, revenue_growth: 0.14,
      profit_margin: 0.06, high_52w: 554.70, low_52w: 436.38,
      overall_score: 83.4, consensus_score: 78, conviction_score: 76, momentum_score: 65, new_position_bonus: 0,
      investors_holding: 25, total_investors: 47, avg_portfolio_weight: 3.8, total_value_held: 98000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Terry Smith", fund: "Fundsmith", shares: 8000000, value: 4227200000, portfolio_weight: 5.2, change_type: "increased", shares_change_pct: 2.5 }
      ]
    },
    {
      ticker: "META", company: "Meta Platforms Inc", cusip: "30303M102", sector: "Technology", industry: "Social Media",
      market_cap_category: "Mega", market_cap: 1010000000000, price: 390.10, pe_ratio: 26.8, revenue_growth: 0.23,
      profit_margin: 0.29, high_52w: 401.02, low_52w: 274.38,
      overall_score: 81.2, consensus_score: 75, conviction_score: 70, momentum_score: 78, new_position_bonus: 0,
      investors_holding: 24, total_investors: 47, avg_portfolio_weight: 3.5, total_value_held: 88000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Chase Coleman", fund: "Tiger Global", shares: 20000000, value: 7802000000, portfolio_weight: 8.8, change_type: "increased", shares_change_pct: 15.2 },
        { investor_name: "Philippe Laffont", fund: "Coatue Management", shares: 15000000, value: 5851500000, portfolio_weight: 6.1, change_type: "unchanged", shares_change_pct: 0 }
      ]
    },
    {
      ticker: "NVDA", company: "NVIDIA Corp", cusip: "67066G104", sector: "Technology", industry: "Semiconductors",
      market_cap_category: "Mega", market_cap: 1220000000000, price: 495.30, pe_ratio: 65.4, revenue_growth: 1.22,
      profit_margin: 0.55, high_52w: 502.66, low_52w: 222.97,
      overall_score: 80.6, consensus_score: 74, conviction_score: 68, momentum_score: 90, new_position_bonus: 10,
      investors_holding: 22, total_investors: 47, avg_portfolio_weight: 3.2, total_value_held: 75000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Chase Coleman", fund: "Tiger Global", shares: 18000000, value: 8915400000, portfolio_weight: 7.5, change_type: "new", shares_change_pct: 100 },
        { investor_name: "Philippe Laffont", fund: "Coatue Management", shares: 25000000, value: 12382500000, portfolio_weight: 10.2, change_type: "new", shares_change_pct: 100 },
        { investor_name: "David Tepper", fund: "Appaloosa Management", shares: 12000000, value: 5943600000, portfolio_weight: 4.5, change_type: "new", shares_change_pct: 100 }
      ]
    },
    {
      ticker: "LLY", company: "Eli Lilly & Co", cusip: "532457108", sector: "Healthcare", industry: "Pharmaceuticals",
      market_cap_category: "Mega", market_cap: 590000000000, price: 620.80, pe_ratio: 105.2, revenue_growth: 0.20,
      profit_margin: 0.18, high_52w: 629.97, low_52w: 400.30,
      overall_score: 78.9, consensus_score: 72, conviction_score: 71, momentum_score: 82, new_position_bonus: 8,
      investors_holding: 20, total_investors: 47, avg_portfolio_weight: 2.9, total_value_held: 62000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Terry Smith", fund: "Fundsmith", shares: 6000000, value: 3724800000, portfolio_weight: 4.5, change_type: "new", shares_change_pct: 100 },
        { investor_name: "Chris Hohn", fund: "TCI Fund Management", shares: 4000000, value: 2483200000, portfolio_weight: 3.1, change_type: "new", shares_change_pct: 100 }
      ]
    },
    {
      ticker: "V", company: "Visa Inc", cusip: "92826C839", sector: "Financial Services", industry: "Payments",
      market_cap_category: "Mega", market_cap: 572000000000, price: 279.50, pe_ratio: 30.1, revenue_growth: 0.11,
      profit_margin: 0.52, high_52w: 290.96, low_52w: 227.78,
      overall_score: 77.5, consensus_score: 70, conviction_score: 67, momentum_score: 60, new_position_bonus: 0,
      investors_holding: 19, total_investors: 47, avg_portfolio_weight: 2.6, total_value_held: 55000000000,
      quarter_change: "unchanged",
      holders: [
        { investor_name: "Seth Klarman", fund: "Baupost Group", shares: 12000000, value: 3354000000, portfolio_weight: 4.8, change_type: "unchanged", shares_change_pct: 0 }
      ]
    },
    {
      ticker: "JPM", company: "JPMorgan Chase & Co", cusip: "46625H100", sector: "Financial Services", industry: "Banking",
      market_cap_category: "Mega", market_cap: 574000000000, price: 198.30, pe_ratio: 11.8, revenue_growth: 0.09,
      profit_margin: 0.33, high_52w: 205.88, low_52w: 143.72,
      overall_score: 76.2, consensus_score: 68, conviction_score: 65, momentum_score: 58, new_position_bonus: 0,
      investors_holding: 18, total_investors: 47, avg_portfolio_weight: 2.4, total_value_held: 48000000000,
      quarter_change: "decreased",
      holders: [
        { investor_name: "Warren Buffett", fund: "Berkshire Hathaway Inc", shares: 0, value: 0, portfolio_weight: 0, change_type: "exited", shares_change_pct: -100 }
      ]
    },
    {
      ticker: "PANW", company: "Palo Alto Networks", cusip: "697435105", sector: "Technology", industry: "Cybersecurity",
      market_cap_category: "Large", market_cap: 102000000000, price: 310.50, pe_ratio: 48.2, revenue_growth: 0.18,
      profit_margin: 0.22, high_52w: 318.44, low_52w: 218.66,
      overall_score: 72.4, consensus_score: 65, conviction_score: 62, momentum_score: 72, new_position_bonus: 6,
      investors_holding: 14, total_investors: 47, avg_portfolio_weight: 1.8, total_value_held: 18000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Philippe Laffont", fund: "Coatue Management", shares: 8000000, value: 2484000000, portfolio_weight: 3.2, change_type: "new", shares_change_pct: 100 },
        { investor_name: "Chase Coleman", fund: "Tiger Global", shares: 5000000, value: 1552500000, portfolio_weight: 2.1, change_type: "new", shares_change_pct: 100 }
      ]
    },
    {
      ticker: "PYPL", company: "PayPal Holdings", cusip: "70450Y103", sector: "Financial Services", industry: "Payments",
      market_cap_category: "Large", market_cap: 68000000000, price: 62.40, pe_ratio: 16.5, revenue_growth: 0.05,
      profit_margin: 0.14, high_52w: 76.54, low_52w: 56.30,
      overall_score: 25.3, consensus_score: 22, conviction_score: 18, momentum_score: 15, new_position_bonus: 0,
      investors_holding: 5, total_investors: 47, avg_portfolio_weight: 0.4, total_value_held: 3200000000,
      quarter_change: "decreased",
      holders: [
        { investor_name: "Seth Klarman", fund: "Baupost Group", shares: 8000000, value: 499200000, portfolio_weight: 0.8, change_type: "decreased", shares_change_pct: -42.0 }
      ]
    },
    {
      ticker: "CRWD", company: "CrowdStrike Holdings", cusip: "22788C105", sector: "Technology", industry: "Cybersecurity",
      market_cap_category: "Large", market_cap: 65000000000, price: 268.20, pe_ratio: 72.1, revenue_growth: 0.33,
      profit_margin: 0.03, high_52w: 274.55, low_52w: 175.80,
      overall_score: 70.1, consensus_score: 62, conviction_score: 58, momentum_score: 75, new_position_bonus: 5,
      investors_holding: 12, total_investors: 47, avg_portfolio_weight: 1.4, total_value_held: 12000000000,
      quarter_change: "increased",
      holders: [
        { investor_name: "Chase Coleman", fund: "Tiger Global", shares: 6000000, value: 1609200000, portfolio_weight: 2.3, change_type: "new", shares_change_pct: 100 }
      ]
    },
    {
      ticker: "DIS", company: "Walt Disney Co", cusip: "254687106", sector: "Communication Services", industry: "Entertainment",
      market_cap_category: "Large", market_cap: 178000000000, price: 97.20, pe_ratio: 58.9, revenue_growth: 0.06,
      profit_margin: 0.04, high_52w: 115.65, low_52w: 78.73,
      overall_score: 30.1, consensus_score: 28, conviction_score: 20, momentum_score: 22, new_position_bonus: 0,
      investors_holding: 7, total_investors: 47, avg_portfolio_weight: 0.6, total_value_held: 5800000000,
      quarter_change: "decreased",
      holders: [
        { investor_name: "Bill Ackman", fund: "Pershing Square", shares: 0, value: 0, portfolio_weight: 0, change_type: "exited", shares_change_pct: -100 }
      ]
    },
    {
      ticker: "BA", company: "Boeing Co", cusip: "097023105", sector: "Industrials", industry: "Aerospace",
      market_cap_category: "Large", market_cap: 128000000000, price: 212.50, pe_ratio: -15.2, revenue_growth: -0.03,
      profit_margin: -0.05, high_52w: 267.54, low_52w: 159.72,
      overall_score: 22.8, consensus_score: 18, conviction_score: 12, momentum_score: 10, new_position_bonus: 0,
      investors_holding: 3, total_investors: 47, avg_portfolio_weight: 0.2, total_value_held: 1200000000,
      quarter_change: "decreased",
      holders: []
    }
  ],
  investors: [
    {
      name: "Warren Buffett", fund: "Berkshire Hathaway Inc", cik: "0001067983", category: "value",
      total_holdings: 45, portfolio_value: 368700000000, top_5_weight: 78.5,
      new_positions: [],
      exited_positions: [{ ticker: "JPM", prev_value: 8200000000 }],
      increased_positions: [{ ticker: "OXY", value: 14200000000, shares_change_pct: 8.2 }],
      decreased_positions: [{ ticker: "AAPL", value: 178882500000, shares_change_pct: -1.2 }]
    },
    {
      name: "Seth Klarman", fund: "Baupost Group", cik: "0001061768", category: "value",
      total_holdings: 38, portfolio_value: 10720000000, top_5_weight: 52.3,
      new_positions: [],
      exited_positions: [],
      increased_positions: [{ ticker: "AAPL", value: 8797500000, shares_change_pct: 5.3 }],
      decreased_positions: [{ ticker: "PYPL", value: 499200000, shares_change_pct: -42.0 }]
    },
    {
      name: "Chase Coleman", fund: "Tiger Global", cik: "0001167483", category: "growth",
      total_holdings: 52, portfolio_value: 69500000000, top_5_weight: 48.1,
      new_positions: [
        { ticker: "NVDA", value: 8915400000 },
        { ticker: "PANW", value: 1552500000 },
        { ticker: "CRWD", value: 1609200000 }
      ],
      exited_positions: [],
      increased_positions: [{ ticker: "AMZN", value: 7795200000, shares_change_pct: 8.5 }, { ticker: "META", value: 7802000000, shares_change_pct: 15.2 }],
      decreased_positions: []
    },
    {
      name: "Philippe Laffont", fund: "Coatue Management", cik: "0001535392", category: "growth",
      total_holdings: 61, portfolio_value: 76200000000, top_5_weight: 42.8,
      new_positions: [
        { ticker: "NVDA", value: 12382500000 },
        { ticker: "PANW", value: 2484000000 }
      ],
      exited_positions: [],
      increased_positions: [{ ticker: "AMZN", value: 5753600000, shares_change_pct: 4.2 }],
      decreased_positions: []
    },
    {
      name: "Terry Smith", fund: "Fundsmith", cik: "0001596110", category: "quality",
      total_holdings: 28, portfolio_value: 82700000000, top_5_weight: 55.2,
      new_positions: [{ ticker: "LLY", value: 3724800000 }],
      exited_positions: [],
      increased_positions: [{ ticker: "MSFT", value: 14532000000, shares_change_pct: 3.8 }, { ticker: "UNH", value: 4227200000, shares_change_pct: 2.5 }],
      decreased_positions: []
    },
    {
      name: "Bill Ackman", fund: "Pershing Square", cik: "0001336528", category: "activist",
      total_holdings: 12, portfolio_value: 18200000000, top_5_weight: 85.0,
      new_positions: [{ ticker: "GOOGL", value: 2552400000 }],
      exited_positions: [{ ticker: "DIS", prev_value: 1450000000 }],
      increased_positions: [],
      decreased_positions: []
    },
    {
      name: "Chris Hohn", fund: "TCI Fund Management", cik: "0001647251", category: "quality",
      total_holdings: 15, portfolio_value: 40500000000, top_5_weight: 72.1,
      new_positions: [{ ticker: "LLY", value: 2483200000 }],
      exited_positions: [],
      increased_positions: [{ ticker: "MSFT", value: 11625600000, shares_change_pct: 2.1 }],
      decreased_positions: []
    },
    {
      name: "David Tepper", fund: "Appaloosa Management", cik: "0001006438", category: "macro",
      total_holdings: 35, portfolio_value: 70300000000, top_5_weight: 45.6,
      new_positions: [{ ticker: "NVDA", value: 5943600000 }],
      exited_positions: [],
      increased_positions: [{ ticker: "GOOGL", value: 7090000000, shares_change_pct: 12.0 }],
      decreased_positions: []
    }
  ]
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function useData() {
  const [summary, setSummary] = useState(null);
  const [holdingsData, setHoldingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [sectors, setSectors] = useState([]);
  const [marketCaps, setMarketCaps] = useState([]);
  const [minScore, setMinScore] = useState(0);

  // Sort
  const [sortKey, setSortKey] = useState('overall_score');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const [sum, hld] = await Promise.all([
          fetchJSON(`${base}data/summary.json`),
          fetchJSON(`${base}data/holdings.json`)
        ]);
        if (!cancelled) {
          setSummary(sum);
          setHoldingsData(hld);
        }
      } catch {
        // Use sample data
        if (!cancelled) {
          setSummary(SAMPLE_SUMMARY);
          setHoldingsData(SAMPLE_HOLDINGS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const holdings = holdingsData?.holdings || [];
  const investors = holdingsData?.investors || [];

  // All available sectors
  const allSectors = useMemo(() => {
    const s = new Set(holdings.map(h => h.sector).filter(Boolean));
    return [...s].sort();
  }, [holdings]);

  const allMarketCaps = useMemo(() => {
    const s = new Set(holdings.map(h => h.market_cap_category).filter(Boolean));
    return [...s];
  }, [holdings]);

  // Filtered holdings
  const filteredHoldings = useMemo(() => {
    let result = holdings;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(h =>
        h.ticker.toLowerCase().includes(q) ||
        h.company.toLowerCase().includes(q)
      );
    }
    if (sectors.length > 0) {
      result = result.filter(h => sectors.includes(h.sector));
    }
    if (marketCaps.length > 0) {
      result = result.filter(h => marketCaps.includes(h.market_cap_category));
    }
    if (minScore > 0) {
      result = result.filter(h => h.overall_score >= minScore);
    }
    return result;
  }, [holdings, search, sectors, marketCaps, minScore]);

  // Sorted holdings
  const sortedHoldings = useMemo(() => {
    if (!sortKey) return filteredHoldings;
    const sorted = [...filteredHoldings].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredHoldings, sortKey, sortDir]);

  const setSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc');
      if (sortDir === null) setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey, sortDir]);

  const resetFilters = useCallback(() => {
    setSearch('');
    setSectors([]);
    setMarketCaps([]);
    setMinScore(0);
  }, []);

  return {
    summary,
    holdings: sortedHoldings,
    allHoldings: holdings,
    investors,
    loading,
    error,
    // Filters
    search, setSearch,
    sectors, setSectors,
    marketCaps, setMarketCaps,
    minScore, setMinScore,
    allSectors,
    allMarketCaps,
    resetFilters,
    // Sort
    sortKey, sortDir, setSort,
  };
}
