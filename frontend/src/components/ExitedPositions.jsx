import { useMemo } from 'react';
import { formatCurrency, formatPercent, getScoreClass, getChangeIndicator } from './DataTable';
import InfoTooltip from './InfoTooltip';

export default function ExitedPositions({ data }) {
  const { allHoldings, investors } = data;

  // Collect all exit/decrease actions across investors
  const exitActions = useMemo(() => {
    const actions = [];

    // From investors data: exited positions
    investors.forEach(inv => {
      (inv.exited_positions || []).forEach(pos => {
        actions.push({
          investor: inv.name,
          fund: inv.fund,
          ticker: pos.ticker,
          type: 'exited',
          prevValue: pos.prev_value,
          reduction: -100,
        });
      });
    });

    // From holdings data: holders with decreased/exited
    allHoldings.forEach(h => {
      (h.holders || []).forEach(hld => {
        if (hld.change_type === 'decreased') {
          actions.push({
            investor: hld.investor_name,
            fund: hld.fund,
            ticker: h.ticker,
            company: h.company,
            sector: h.sector,
            type: 'decreased',
            value: hld.value,
            reduction: hld.shares_change_pct,
            portfolioWeight: hld.portfolio_weight,
            score: h.overall_score,
          });
        }
        if (hld.change_type === 'exited') {
          // Merge company info
          const existing = actions.find(a => a.ticker === h.ticker && a.investor === hld.investor_name && a.type === 'exited');
          if (existing) {
            existing.company = h.company;
            existing.sector = h.sector;
            existing.score = h.overall_score;
          } else {
            actions.push({
              investor: hld.investor_name,
              fund: hld.fund,
              ticker: h.ticker,
              company: h.company,
              sector: h.sector,
              type: 'exited',
              value: 0,
              reduction: -100,
              portfolioWeight: 0,
              score: h.overall_score,
            });
          }
        }
      });
    });

    // Deduplicate
    const seen = new Set();
    return actions.filter(a => {
      const key = `${a.investor}_${a.ticker}_${a.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.reduction - b.reduction);
  }, [allHoldings, investors]);

  const fullExits = exitActions.filter(a => a.type === 'exited');
  const reductions = exitActions.filter(a => a.type === 'decreased');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Posizioni Chiuse e Ridotte</h1>
        <p className="page-subtitle">
          Titoli che gli investitori stanno vendendo o riducendo. Le uscite complete sono segnali forti.
        </p>
      </div>

      {exitActions.length === 0 ? (
        <div className="no-data">Nessuna uscita o riduzione significativa in questo trimestre</div>
      ) : (
        <>
          {/* Full Exits */}
          {fullExits.length > 0 && (
            <div className="section">
              <h2 className="section-title">
                <span style={{ color: 'var(--negative)' }}>✕</span> Uscite Complete
              </h2>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Investitore</th>
                      <th>Fondo</th>
                      <th>Ticker</th>
                      <th>Azienda</th>
                      <th>Valore Precedente</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullExits.map((a, i) => (
                      <tr key={`${a.investor}-${a.ticker}-${i}`}>
                        <td style={{ fontWeight: 600 }}>{a.investor}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{a.fund}</td>
                        <td className="ticker-cell">{a.ticker}</td>
                        <td>{a.company || '—'}</td>
                        <td>{a.prevValue ? formatCurrency(a.prevValue) : '—'}</td>
                        <td>
                          <span className="change-exited" style={{ fontWeight: 600 }}>
                            ✕ Uscita completa
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reductions */}
          {reductions.length > 0 && (
            <div className="section">
              <h2 className="section-title">
                <span style={{ color: 'var(--warning)' }}>▼</span> Riduzioni Parziali
              </h2>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Investitore</th>
                      <th>Ticker</th>
                      <th>Azienda</th>
                      <th>Riduzione %</th>
                      <th>Valore Residuo</th>
                      <th>Peso Portafoglio <InfoTooltip metricKey="avg_portfolio_weight" /></th>
                      <th>Score <InfoTooltip metricKey="overall_score" /></th>
                      <th>Settore <InfoTooltip metricKey="sector" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reductions.map((a, i) => (
                      <tr key={`${a.investor}-${a.ticker}-${i}`}>
                        <td style={{ fontWeight: 600 }}>{a.investor}</td>
                        <td className="ticker-cell">{a.ticker}</td>
                        <td>{a.company || '—'}</td>
                        <td className="change-decreased">
                          ▼ {a.reduction != null ? `${a.reduction.toFixed(1)}%` : '—'}
                        </td>
                        <td>{formatCurrency(a.value)}</td>
                        <td>{formatPercent(a.portfolioWeight)}</td>
                        <td>
                          {a.score != null ? (
                            <span className={`score-badge ${getScoreClass(a.score)}`}>
                              {a.score.toFixed(1)}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {a.sector ? <span className="badge badge-sector">{a.sector}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
