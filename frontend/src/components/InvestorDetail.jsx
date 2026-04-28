import { useState, useMemo } from 'react';
import { formatCurrency, formatPercent, getScoreClass, getChangeIndicator } from './DataTable';

export default function InvestorDetail({ data }) {
  const { investors, allHoldings } = data;
  const [selectedInvestor, setSelectedInvestor] = useState('');

  const investor = useMemo(() => {
    return investors.find(inv => inv.name === selectedInvestor) || null;
  }, [investors, selectedInvestor]);

  // Build the investor's holdings from allHoldings
  const investorHoldings = useMemo(() => {
    if (!investor) return [];
    return allHoldings
      .map(h => {
        const holder = (h.holders || []).find(hld => hld.investor_name === investor.name);
        if (!holder) return null;
        return {
          ticker: h.ticker,
          company: h.company,
          sector: h.sector,
          overall_score: h.overall_score,
          portfolio_weight: holder.portfolio_weight,
          value: holder.value,
          shares: holder.shares,
          change_type: holder.change_type,
          shares_change_pct: holder.shares_change_pct,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.portfolio_weight - a.portfolio_weight);
  }, [investor, allHoldings]);

  const categoryLabel = (cat) => {
    const labels = {
      value: 'Value',
      growth: 'Growth',
      quality: 'Quality',
      activist: 'Attivista',
      macro: 'Macro',
    };
    return labels[cat] || cat;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dettaglio Investitori</h1>
        <p className="page-subtitle">
          Seleziona un investitore per visualizzare il suo portafoglio completo e i movimenti recenti.
        </p>
      </div>

      <div className="investor-select-wrapper">
        <select
          className="investor-select"
          value={selectedInvestor}
          onChange={e => setSelectedInvestor(e.target.value)}
        >
          <option value="">— Seleziona un investitore —</option>
          {investors.map(inv => (
            <option key={inv.name} value={inv.name}>
              {inv.name}{inv.fund && inv.fund !== inv.name ? ` (${inv.fund})` : ''}
            </option>
          ))}
        </select>
      </div>

      {!investor ? (
        <div className="no-data">
          Seleziona un investitore dal menu sopra per visualizzarne i dettagli
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="investor-summary-grid">
            <div className="stat-card">
              <div className="stat-card-label">Fondo</div>
              <div className="stat-card-value" style={{ fontSize: 'var(--font-size-lg)' }}>
                {investor.fund}
              </div>
              {investor.category ? (
                <div className="stat-card-detail">
                  Strategia: <span className="badge badge-sector">{categoryLabel(investor.category)}</span>
                </div>
              ) : null}
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Valore Portafoglio</div>
              <div className="stat-card-value">{formatCurrency(investor.portfolio_value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Numero Posizioni</div>
              <div className="stat-card-value">{investor.total_holdings}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Concentrazione Top 5</div>
              <div className="stat-card-value">{formatPercent(investor.top_5_weight)}</div>
              <div className="stat-card-detail">
                {investor.top_5_weight > 60 ? 'Portafoglio concentrato' : 'Portafoglio diversificato'}
              </div>
            </div>
          </div>

          {/* Movements */}
          <div className="movement-section">
            <div className="movement-card">
              <div className="movement-card-title">
                <span style={{ color: 'var(--positive)' }}>⊕</span> Nuove Posizioni ({investor.new_positions?.length || 0})
              </div>
              {(investor.new_positions || []).length === 0 ? (
                <div className="no-data" style={{ padding: 'var(--spacing-sm)' }}>Nessuna</div>
              ) : (
                investor.new_positions.map(p => (
                  <div key={p.ticker} className="movement-item">
                    <span className="ticker-cell">{p.ticker}</span>
                    <span>{formatCurrency(p.value)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="movement-card">
              <div className="movement-card-title">
                <span style={{ color: 'var(--negative)' }}>⊖</span> Posizioni Chiuse ({investor.exited_positions?.length || 0})
              </div>
              {(investor.exited_positions || []).length === 0 ? (
                <div className="no-data" style={{ padding: 'var(--spacing-sm)' }}>Nessuna</div>
              ) : (
                investor.exited_positions.map(p => (
                  <div key={p.ticker} className="movement-item">
                    <span className="ticker-cell">{p.ticker}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      (era {formatCurrency(p.prev_value)})
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="movement-card">
              <div className="movement-card-title">
                <span style={{ color: 'var(--positive)' }}>▲</span> Aumentate ({investor.increased_positions?.length || 0})
              </div>
              {(investor.increased_positions || []).length === 0 ? (
                <div className="no-data" style={{ padding: 'var(--spacing-sm)' }}>Nessuna</div>
              ) : (
                investor.increased_positions.map(p => (
                  <div key={p.ticker} className="movement-item">
                    <div>
                      <span className="ticker-cell">{p.ticker}</span>
                      <span style={{ marginLeft: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {formatCurrency(p.value)}
                      </span>
                    </div>
                    <span className="change-increased">
                      +{p.shares_change_pct?.toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="movement-card">
              <div className="movement-card-title">
                <span style={{ color: 'var(--negative)' }}>▼</span> Ridotte ({investor.decreased_positions?.length || 0})
              </div>
              {(investor.decreased_positions || []).length === 0 ? (
                <div className="no-data" style={{ padding: 'var(--spacing-sm)' }}>Nessuna</div>
              ) : (
                investor.decreased_positions.map(p => (
                  <div key={p.ticker} className="movement-item">
                    <div>
                      <span className="ticker-cell">{p.ticker}</span>
                      <span style={{ marginLeft: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {formatCurrency(p.value)}
                      </span>
                    </div>
                    <span className="change-decreased">
                      {p.shares_change_pct?.toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Full holdings table */}
          <div className="section">
            <h2 className="section-title">📋 Portafoglio Completo</h2>
            {investorHoldings.length === 0 ? (
              <div className="no-data">Nessun dettaglio disponibile per questo investitore</div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ticker</th>
                      <th>Azienda</th>
                      <th>Peso %</th>
                      <th>Valore</th>
                      <th>Azioni</th>
                      <th>Variazione</th>
                      <th>Score</th>
                      <th>Settore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investorHoldings.map((h, i) => {
                      const c = getChangeIndicator(h.change_type);
                      return (
                        <tr key={h.ticker}>
                          <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                          <td className="ticker-cell">{h.ticker}</td>
                          <td>{h.company}</td>
                          <td style={{ fontWeight: 700 }}>{formatPercent(h.portfolio_weight)}</td>
                          <td>{formatCurrency(h.value)}</td>
                          <td>{h.shares?.toLocaleString('it-IT') || '—'}</td>
                          <td>
                            <span className={c.className}>
                              {c.symbol} {h.change_type !== 'new' && h.change_type !== 'exited' && h.shares_change_pct
                                ? `${h.shares_change_pct > 0 ? '+' : ''}${h.shares_change_pct.toFixed(1)}%`
                                : c.label}
                            </span>
                          </td>
                          <td>
                            <span className={`score-badge ${getScoreClass(h.overall_score)}`}>
                              {h.overall_score != null ? h.overall_score.toFixed(1) : '—'}
                            </span>
                          </td>
                          <td><span className="badge badge-sector">{h.sector}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
