import { useMemo } from 'react';
import DataTable, { formatPercent, formatCurrency, getScoreClass } from './DataTable';

export default function ConsensusPicks({ data }) {
  const { allHoldings, sortKey, sortDir, setSort } = data;

  const sorted = useMemo(() => {
    return [...allHoldings].sort((a, b) => {
      const key = sortKey || 'consensus_score';
      const dir = sortDir || 'desc';
      let va = a[key], vb = b[key];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allHoldings, sortKey, sortDir]);

  const columns = [
    {
      key: 'ticker',
      label: 'Ticker',
      render: (val) => <span className="ticker-cell">{val}</span>
    },
    {
      key: 'company',
      label: 'Azienda',
    },
    {
      key: 'consensus_score',
      label: 'Score Consenso',
      render: (val) => (
        <span className={`score-badge ${getScoreClass(val)}`}>{val}</span>
      )
    },
    {
      key: 'investors_holding',
      label: '# Investitori',
    },
    {
      key: 'total_investors',
      label: 'Totale Monitorati',
    },
    {
      key: 'investors_holding',
      label: '% Accordo',
      render: (val, row) => {
        const pct = row.total_investors ? ((val / row.total_investors) * 100) : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '60px',
              height: '6px',
              background: 'var(--bg-tertiary)',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                background: pct > 50 ? 'var(--positive)' : pct > 25 ? 'var(--warning)' : 'var(--negative)',
                borderRadius: '3px'
              }} />
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)' }}>{pct.toFixed(0)}%</span>
          </div>
        );
      }
    },
    {
      key: 'avg_portfolio_weight',
      label: 'Peso Medio',
      render: (val) => formatPercent(val)
    },
    {
      key: 'overall_score',
      label: 'Score Complessivo',
      render: (val) => (
        <span className={`score-badge ${getScoreClass(val)}`}>{val?.toFixed(1)}</span>
      )
    },
    {
      key: 'sector',
      label: 'Settore',
      render: (val) => <span className="badge badge-sector">{val}</span>
    }
  ];

  // Give unique keys to columns
  const columnsWithKeys = columns.map((c, i) => ({
    ...c,
    key: c.label === '% Accordo' ? '_agreement_pct' : c.key,
    _sortKey: c.key
  }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consensus Picks</h1>
        <p className="page-subtitle">
          Titoli ordinati per punteggio di consenso tra gli investitori.
          Un alto consenso indica che molti super investitori detengono il titolo.
        </p>
      </div>

      {/* Top consensus highlight */}
      {sorted.length > 0 && (
        <div className="alert-box success" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="alert-title">
            Massimo Consenso: {sorted[0].ticker} — {sorted[0].company}
          </div>
          <div className="alert-body">
            Detenuto da {sorted[0].investors_holding} investitori su {sorted[0].total_investors} monitorati
            ({sorted[0].total_investors ? ((sorted[0].investors_holding / sorted[0].total_investors) * 100).toFixed(0) : 0}% di accordo).
            Score consenso: {sorted[0].consensus_score}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={sorted}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={setSort}
        expandable
        renderExpanded={(row) => {
          const holders = row.holders || [];
          return (
            <div>
              <h4 style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}>
                Investitori che detengono {row.ticker} ({holders.length})
              </h4>
              {holders.length === 0 ? (
                <div className="no-data">Dettaglio non disponibile</div>
              ) : (
                <div className="holders-list">
                  {holders.map(h => (
                    <div key={h.investor_name} className="holder-chip">
                      <div>
                        <div className="holder-name">{h.investor_name}</div>
                        <div className="holder-detail">{h.fund}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPercent(h.portfolio_weight)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
        emptyMessage="Nessun dato disponibile"
      />
    </div>
  );
}
