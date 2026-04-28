import { useMemo } from 'react';
import { formatCurrency, formatPercent, getScoreClass } from './DataTable';

export default function NewPositions({ data }) {
  const { allHoldings } = data;

  // Find holdings where at least one holder has change_type "new"
  const newPositions = useMemo(() => {
    return allHoldings
      .map(h => {
        const newHolders = (h.holders || []).filter(hld => hld.change_type === 'new');
        return { ...h, newHolders, newCount: newHolders.length };
      })
      .filter(h => h.newCount > 0)
      .sort((a, b) => b.newCount - a.newCount);
  }, [allHoldings]);

  // Group by cluster strength
  const strongClusters = newPositions.filter(h => h.newCount >= 3);
  const moderateClusters = newPositions.filter(h => h.newCount === 2);
  const singleNew = newPositions.filter(h => h.newCount === 1);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Nuove Posizioni</h1>
        <p className="page-subtitle">
          Titoli su cui gli investitori hanno aperto nuove posizioni questo trimestre.
          I cluster (3+ investitori) sono segnali particolarmente forti.
        </p>
      </div>

      {newPositions.length === 0 ? (
        <div className="no-data">Nessuna nuova posizione rilevata in questo trimestre</div>
      ) : (
        <>
          {/* Strong clusters */}
          {strongClusters.length > 0 && (
            <div className="section">
              <h2 className="section-title">
                <span style={{ color: 'var(--positive)' }}>●●●</span> Cluster Forti (3+ investitori)
              </h2>
              {strongClusters.map(h => (
                <ClusterCard key={h.ticker} holding={h} strength="strong" />
              ))}
            </div>
          )}

          {/* Moderate clusters */}
          {moderateClusters.length > 0 && (
            <div className="section">
              <h2 className="section-title">
                <span style={{ color: 'var(--warning)' }}>●●</span> Cluster Moderati (2 investitori)
              </h2>
              {moderateClusters.map(h => (
                <ClusterCard key={h.ticker} holding={h} strength="moderate" />
              ))}
            </div>
          )}

          {/* Single new */}
          {singleNew.length > 0 && (
            <div className="section">
              <h2 className="section-title">
                <span style={{ color: 'var(--text-tertiary)' }}>●</span> Posizioni Singole
              </h2>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Azienda</th>
                      <th>Score</th>
                      <th>Investitore</th>
                      <th>Peso Portafoglio</th>
                      <th>Settore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {singleNew.map(h => (
                      <tr key={h.ticker}>
                        <td className="ticker-cell">{h.ticker}</td>
                        <td>{h.company}</td>
                        <td>
                          <span className={`score-badge ${getScoreClass(h.overall_score)}`}>
                            {h.overall_score.toFixed(1)}
                          </span>
                        </td>
                        <td>{h.newHolders[0]?.investor_name || '—'}</td>
                        <td>{formatPercent(h.newHolders[0]?.portfolio_weight)}</td>
                        <td><span className="badge badge-sector">{h.sector}</span></td>
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

function ClusterCard({ holding, strength }) {
  const h = holding;
  return (
    <div className="cluster-card" style={{ marginBottom: 'var(--spacing-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span className={`cluster-strength ${strength === 'strong' ? 'cluster-strong' : 'cluster-moderate'}`}>
            {h.newCount} investitori entrano contemporaneamente
          </span>
          <div style={{ marginTop: '8px' }}>
            <span className="ticker-cell" style={{ fontSize: 'var(--font-size-lg)' }}>{h.ticker}</span>
            <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>{h.company}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`score-badge ${getScoreClass(h.overall_score)}`}>
            Score: {h.overall_score.toFixed(1)}
          </span>
          <div style={{ marginTop: '4px' }}>
            <span className="badge badge-sector">{h.sector}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--spacing-md)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
          INVESTITORI CHE HANNO APERTO POSIZIONE:
        </div>
        <div className="holders-list">
          {h.newHolders.map(hld => (
            <div key={hld.investor_name} className="holder-chip">
              <div>
                <div className="holder-name">{hld.investor_name}</div>
                <div className="holder-detail">{hld.fund}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{formatPercent(hld.portfolio_weight)}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                  {formatCurrency(hld.value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
