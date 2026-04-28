import DataTable, {
  formatCurrency, formatPercent, formatPercentFromDecimal,
  formatPrice, formatRatio, getScoreClass, getChangeIndicator
} from './DataTable';
import Filters from './Filters';

const COLUMNS = [
  {
    key: 'ticker',
    label: 'Ticker',
    width: '80px',
    render: (val) => <span className="ticker-cell">{val}</span>
  },
  {
    key: 'company',
    label: 'Azienda',
    render: (val) => val
  },
  {
    key: 'sector',
    label: 'Settore',
    render: (val) => <span className="badge badge-sector">{val}</span>
  },
  {
    key: 'overall_score',
    label: 'Score',
    render: (val) => (
      <span className={`score-badge ${getScoreClass(val)}`}>
        {val?.toFixed(1) ?? '—'}
      </span>
    )
  },
  {
    key: 'investors_holding',
    label: '# Investitori',
    render: (val) => val
  },
  {
    key: 'avg_portfolio_weight',
    label: 'Peso Medio %',
    render: (val) => formatPercent(val)
  },
  {
    key: 'total_value_held',
    label: 'Valore Totale',
    render: (val) => formatCurrency(val)
  },
  {
    key: 'quarter_change',
    label: 'Variazione',
    render: (val) => {
      const c = getChangeIndicator(val);
      return <span className={c.className}>{c.symbol} {c.label}</span>;
    }
  },
  {
    key: 'pe_ratio',
    label: 'P/E',
    render: (val) => formatRatio(val)
  },
  {
    key: 'revenue_growth',
    label: 'Crescita Rev.',
    render: (val) => formatPercentFromDecimal(val)
  }
];

function HoldersList({ holders }) {
  if (!holders || holders.length === 0) {
    return <div className="no-data">Nessun dettaglio disponibile</div>;
  }
  return (
    <div>
      <h4 style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}>
        Detentori ({holders.length})
      </h4>
      <div className="holders-list">
        {holders.map(h => {
          const c = getChangeIndicator(h.change_type);
          return (
            <div key={h.investor_name} className="holder-chip">
              <div>
                <div className="holder-name">{h.investor_name}</div>
                <div className="holder-detail">{h.fund}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{formatPercent(h.portfolio_weight)}</div>
                <div className={c.className} style={{ fontSize: 'var(--font-size-xs)' }}>
                  {c.symbol} {h.shares_change_pct != null && h.shares_change_pct !== 0 && h.change_type !== 'new' && h.change_type !== 'exited'
                    ? `${h.shares_change_pct > 0 ? '+' : ''}${h.shares_change_pct.toFixed(1)}%`
                    : c.label
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TopHoldings({ data }) {
  const {
    holdings, sortKey, sortDir, setSort,
    search, setSearch, sectors, setSectors,
    marketCaps, setMarketCaps, minScore, setMinScore,
    allSectors, allMarketCaps, resetFilters
  } = data;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Top Holdings</h1>
        <p className="page-subtitle">
          Tutte le posizioni ordinate per punteggio complessivo. Clicca su una riga per espandere i detentori.
        </p>
      </div>

      <Filters
        search={search} setSearch={setSearch}
        sectors={sectors} setSectors={setSectors}
        marketCaps={marketCaps} setMarketCaps={setMarketCaps}
        minScore={minScore} setMinScore={setMinScore}
        allSectors={allSectors} allMarketCaps={allMarketCaps}
        resetFilters={resetFilters}
      />

      <DataTable
        columns={COLUMNS}
        data={holdings}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={setSort}
        expandable
        renderExpanded={(row) => <HoldersList holders={row.holders} />}
        emptyMessage="Nessun titolo corrisponde ai filtri selezionati"
      />
    </div>
  );
}
