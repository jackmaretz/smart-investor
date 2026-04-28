import { useMemo } from 'react';
import { formatPercent, formatCurrency, getScoreClass } from './DataTable';

export default function ConvictionRanking({ data }) {
  const { allHoldings } = data;

  // Build ranking: for each holding, find the investor with the highest portfolio weight
  const convictionData = useMemo(() => {
    const entries = [];
    allHoldings.forEach(h => {
      (h.holders || []).forEach(hld => {
        if (hld.portfolio_weight > 0) {
          entries.push({
            ticker: h.ticker,
            company: h.company,
            sector: h.sector,
            overall_score: h.overall_score,
            conviction_score: h.conviction_score,
            investor: hld.investor_name,
            fund: hld.fund,
            portfolio_weight: hld.portfolio_weight,
            value: hld.value,
            change_type: hld.change_type,
          });
        }
      });
    });
    return entries.sort((a, b) => b.portfolio_weight - a.portfolio_weight);
  }, [allHoldings]);

  // Top conviction per investor
  const topByInvestor = useMemo(() => {
    const map = {};
    convictionData.forEach(e => {
      if (!map[e.investor] || e.portfolio_weight > map[e.investor].portfolio_weight) {
        map[e.investor] = e;
      }
    });
    return Object.values(map).sort((a, b) => b.portfolio_weight - a.portfolio_weight);
  }, [convictionData]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ranking Convinzione</h1>
        <p className="page-subtitle">
          Classifiche basate sul peso percentuale in portafoglio. Un peso elevato indica alta convinzione dell'investitore.
        </p>
      </div>

      {/* Top conviction per investor */}
      <div className="section">
        <h2 className="section-title">🏆 Massima Convinzione per Investitore</h2>
        <p className="page-subtitle" style={{ marginBottom: 'var(--spacing-md)' }}>
          La posizione con il peso maggiore nel portafoglio di ciascun investitore
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Investitore</th>
                <th>Fondo</th>
                <th>Ticker</th>
                <th>Azienda</th>
                <th>Peso Portafoglio</th>
                <th>Valore</th>
                <th>Score</th>
                <th>Settore</th>
              </tr>
            </thead>
            <tbody>
              {topByInvestor.map((e, i) => (
                <tr key={e.investor}>
                  <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{e.investor}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>{e.fund}</td>
                  <td className="ticker-cell">{e.ticker}</td>
                  <td>{e.company}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '60px',
                        height: '8px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(e.portfolio_weight * 2, 100)}%`,
                          height: '100%',
                          background: e.portfolio_weight > 20 ? 'var(--positive)' : e.portfolio_weight > 10 ? 'var(--accent-primary)' : 'var(--warning)',
                          borderRadius: '4px'
                        }} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{formatPercent(e.portfolio_weight)}</span>
                    </div>
                  </td>
                  <td>{formatCurrency(e.value)}</td>
                  <td>
                    <span className={`score-badge ${getScoreClass(e.overall_score)}`}>
                      {e.overall_score.toFixed(1)}
                    </span>
                  </td>
                  <td><span className="badge badge-sector">{e.sector}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full conviction ranking */}
      <div className="section">
        <h2 className="section-title">▰ Ranking Completo per Peso</h2>
        <p className="page-subtitle" style={{ marginBottom: 'var(--spacing-md)' }}>
          Tutte le posizioni ordinate per peso in portafoglio (top 30)
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Investitore</th>
                <th>Ticker</th>
                <th>Azienda</th>
                <th>Peso %</th>
                <th>Valore</th>
                <th>Score Conv.</th>
                <th>Score Tot.</th>
                <th>Settore</th>
              </tr>
            </thead>
            <tbody>
              {convictionData.slice(0, 30).map((e, i) => (
                <tr key={`${e.investor}-${e.ticker}`}>
                  <td style={{ color: 'var(--text-tertiary)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{e.investor}</td>
                  <td className="ticker-cell">{e.ticker}</td>
                  <td>{e.company}</td>
                  <td style={{ fontWeight: 700 }}>{formatPercent(e.portfolio_weight)}</td>
                  <td>{formatCurrency(e.value)}</td>
                  <td>
                    <span className={`score-badge ${getScoreClass(e.conviction_score)}`}>
                      {e.conviction_score}
                    </span>
                  </td>
                  <td>
                    <span className={`score-badge ${getScoreClass(e.overall_score)}`}>
                      {e.overall_score.toFixed(1)}
                    </span>
                  </td>
                  <td><span className="badge badge-sector">{e.sector}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
