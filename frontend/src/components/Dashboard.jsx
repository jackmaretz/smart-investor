import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatCurrency, formatNumber, formatPercent, getScoreClass, getChangeIndicator } from './DataTable';
import { useTheme } from '../context/ThemeContext';
import InfoTooltip from './InfoTooltip';
import BuySellSignals from './BuySellSignals';

const PIE_COLORS = [
  '#2d2d2d', '#4a4a4a', '#666666', '#808080', '#999999',
  '#b3b3b3', '#cccccc', '#e0e0e0', '#454545', '#737373'
];

export default function Dashboard({ summary, holdings }) {
  const { theme } = useTheme();
  const meta = summary?.metadata || {};
  const stats = summary?.stats || {};
  const topPicks = summary?.top_picks || [];
  const sellSignals = summary?.sell_signals || [];
  const newClusters = summary?.new_position_clusters || [];
  const sectorDist = summary?.sector_distribution || {};

  const sectorData = useMemo(() => {
    return Object.entries(sectorDist).map(([name, value]) => ({ name, value }));
  }, [sectorDist]);

  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#1c1c1c' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#d9d9d9'}`,
    borderRadius: '8px',
    color: theme === 'dark' ? '#e0e0e0' : '#1a1a1a',
    fontSize: '12px',
  };

  // Build a minimal data object for BuySellSignals compact mode
  const buySellData = {
    allHoldings: holdings || [],
    summary,
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Panoramica dei portafogli — {meta.quarter || 'N/A'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">{'◉'}</div>
          <div className="stat-card-label">
            Investitori Analizzati
            <InfoTooltip metricKey="investors_analyzed" />
          </div>
          <div className="stat-card-value">{formatNumber(meta.investors_analyzed)}</div>
          <div className="stat-card-detail">Super investitori monitorati</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">{'▦'}</div>
          <div className="stat-card-label">
            Titoli Unici
            <InfoTooltip metricKey="unique_holdings" />
          </div>
          <div className="stat-card-value">{formatNumber(meta.unique_holdings)}</div>
          <div className="stat-card-detail">Posizioni distinte identificate</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">{'★'}</div>
          <div className="stat-card-label">
            Top 10 Score Medio
            <InfoTooltip metricKey="top_10_avg" />
          </div>
          <div className="stat-card-value">{stats.top_10_avg?.toFixed(1) || '—'}</div>
          <div className="stat-card-detail">Media score delle migliori 10 posizioni</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">{'$'}</div>
          <div className="stat-card-label">
            Valore Totale Portafogli
            <InfoTooltip metricKey="total_portfolio_value" />
          </div>
          <div className="stat-card-value">{meta.total_portfolio_value != null ? formatCurrency(meta.total_portfolio_value) : 'N/A'}</div>
          <div className="stat-card-detail">AUM combinato degli investitori</div>
        </div>
      </div>

      {/* Compact Buy/Sell Signals */}
      <div className="section">
        <h2 className="section-title">{'⇅'} Segnali Rapidi</h2>
        <BuySellSignals data={buySellData} compact />
      </div>

      <div className="dashboard-grid">
        {/* Top 10 Picks */}
        <div className="card full-width">
          <div className="card-header">
            <h2 className="card-title">{'★'} Top 10 Picks</h2>
            <span className="card-subtitle">Titoli con il punteggio complessivo piu' alto</span>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ticker <InfoTooltip metricKey="ticker" /></th>
                  <th>Azienda</th>
                  <th>Score <InfoTooltip metricKey="overall_score" /></th>
                  <th>Consenso <InfoTooltip metricKey="consensus_score" /></th>
                  <th>Convinzione <InfoTooltip metricKey="conviction_score" /></th>
                  <th>Investitori <InfoTooltip metricKey="investors_holding" /></th>
                  <th>Peso Medio <InfoTooltip metricKey="avg_portfolio_weight" /></th>
                  <th>Settore <InfoTooltip metricKey="sector" /></th>
                </tr>
              </thead>
              <tbody>
                {topPicks.slice(0, 10).map((h, i) => (
                  <tr key={h.ticker}>
                    <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                    <td className="ticker-cell">{h.ticker}</td>
                    <td>{h.company}</td>
                    <td>
                      <span className={`score-badge ${getScoreClass(h.overall_score)}`}>
                        {h.overall_score.toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`score-badge ${getScoreClass(h.consensus_score)}`}>
                        {h.consensus_score}
                      </span>
                    </td>
                    <td>
                      <span className={`score-badge ${getScoreClass(h.conviction_score)}`}>
                        {h.conviction_score}
                      </span>
                    </td>
                    <td>{h.investors_holding}</td>
                    <td>{h.avg_portfolio_weight != null ? formatPercent(h.avg_portfolio_weight) : '—'}</td>
                    <td><span className="badge badge-sector">{h.sector}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sell Signals */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{'▼'} Segnali di Vendita</h2>
          </div>
          {sellSignals.length === 0 ? (
            <div className="no-data">Nessun segnale di vendita significativo</div>
          ) : (
            sellSignals.map(s => (
              <div key={s.ticker} className="alert-box danger" style={{ marginBottom: '8px' }}>
                <div className="alert-title">
                  {s.ticker} — {s.company}
                </div>
                <div className="alert-body">
                  {s.investors_selling} investitori in vendita
                  {s.avg_reduction != null ? ` · Riduzione media: ${formatPercent(Math.abs(s.avg_reduction))}` : ''}
                  {s.overall_score != null ? ` · Score: ${s.overall_score.toFixed(1)}` : ''}
                </div>
              </div>
            ))
          )}
        </div>

        {/* New Position Clusters */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{'⊕'} Cluster Nuove Posizioni</h2>
          </div>
          {newClusters.length === 0 ? (
            <div className="no-data">Nessun cluster significativo</div>
          ) : (
            newClusters.map(c => (
              <div key={c.ticker} className="cluster-card" style={{ marginBottom: '8px' }}>
                <span className={`cluster-strength ${c.investors_entering >= 5 ? 'cluster-strong' : 'cluster-moderate'}`}>
                  {c.investors_entering >= 5 ? '●●● Forte' : '●● Moderato'} — {c.investors_entering} investitori
                </span>
                <div style={{ marginTop: '6px' }}>
                  <strong className="ticker-cell">{c.ticker}</strong> — {c.company}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Settore: {c.sector}{c.avg_initial_weight != null ? ` · Peso medio iniziale: ${formatPercent(c.avg_initial_weight)}` : ''}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sector Distribution */}
        <div className="card full-width">
          <div className="card-header">
            <h2 className="card-title">{'◐'} Distribuzione Settoriale</h2>
            <span className="card-subtitle">Peso percentuale per settore tra tutti i portafogli</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
            <div style={{ flex: '1 1 300px' }}>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorData}
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      innerRadius="40%"
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {sectorData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(val) => [Number.isInteger(val) ? formatNumber(val) : `${val.toFixed(1)}%`, Number.isInteger(val) ? 'Titoli' : 'Peso']}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 'var(--font-size-xs)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ flex: '1 1 300px' }}>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorData} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(val) => [Number.isInteger(val) ? formatNumber(val) : `${val.toFixed(1)}%`, Number.isInteger(val) ? 'Titoli' : 'Peso']}
                    />
                    <Bar dataKey="value" fill="#666666" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
