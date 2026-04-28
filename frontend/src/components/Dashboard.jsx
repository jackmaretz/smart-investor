import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatCurrency, formatNumber, formatPercent, getScoreClass, getChangeIndicator } from './DataTable';
import { useTheme } from '../context/ThemeContext';

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
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
    backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#2d3a52' : '#e2e8f0'}`,
    borderRadius: '8px',
    color: theme === 'dark' ? '#e2e8f0' : '#1a1f36',
    fontSize: '12px',
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
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-label">Investitori Analizzati</div>
          <div className="stat-card-value">{formatNumber(meta.investors_analyzed)}</div>
          <div className="stat-card-detail">Super investitori monitorati</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-label">Titoli Unici</div>
          <div className="stat-card-value">{formatNumber(meta.unique_holdings)}</div>
          <div className="stat-card-detail">Posizioni distinte identificate</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🏆</div>
          <div className="stat-card-label">Top 10 Score Medio</div>
          <div className="stat-card-value">{stats.top_10_avg?.toFixed(1) || '—'}</div>
          <div className="stat-card-detail">Media score delle migliori 10 posizioni</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-label">Valore Totale Portafogli</div>
          <div className="stat-card-value">{meta.total_portfolio_value != null ? formatCurrency(meta.total_portfolio_value) : 'N/A'}</div>
          <div className="stat-card-detail">AUM combinato degli investitori</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Top 10 Picks */}
        <div className="card full-width">
          <div className="card-header">
            <h2 className="card-title">★ Top 10 Picks</h2>
            <span className="card-subtitle">Titoli con il punteggio complessivo più alto</span>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ticker</th>
                  <th>Azienda</th>
                  <th>Score</th>
                  <th>Consenso</th>
                  <th>Convinzione</th>
                  <th>Investitori</th>
                  <th>Peso Medio</th>
                  <th>Settore</th>
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
            <h2 className="card-title">⚠ Segnali di Vendita</h2>
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
            <h2 className="card-title">⊕ Cluster Nuove Posizioni</h2>
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
            <h2 className="card-title">◐ Distribuzione Settoriale</h2>
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
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
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
