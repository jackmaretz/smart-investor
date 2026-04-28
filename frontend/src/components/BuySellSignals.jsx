import { useMemo } from 'react';
import { getScoreClass } from './DataTable';
import InfoTooltip from './InfoTooltip';

export default function BuySellSignals({ data, compact = false }) {
  const { allHoldings, summary } = data || {};
  const sellSignals = summary?.sell_signals || [];

  const buyList = useMemo(() => {
    if (!allHoldings || allHoldings.length === 0) return [];
    return [...allHoldings]
      .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))
      .slice(0, compact ? 5 : 15);
  }, [allHoldings, compact]);

  const sellList = useMemo(() => {
    if (!sellSignals || sellSignals.length === 0) return [];
    return compact ? sellSignals.slice(0, 5) : sellSignals;
  }, [sellSignals, compact]);

  return (
    <div>
      {!compact && (
        <div className="page-header">
          <h1 className="page-title">Segnali Compra / Vendi</h1>
          <p className="page-subtitle">
            Riepilogo dei titoli con i segnali di acquisto e vendita piu' forti, basati sull'analisi dei portafogli 13F.
          </p>
        </div>
      )}

      <div className="buy-sell-container">
        {/* BUY column */}
        <div className="buy-sell-column buy-column-border">
          <div className="buy-sell-header buy">
            {'▲'} Compra
            {!compact && (
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, marginLeft: '8px', opacity: 0.8 }}>
                Top {buyList.length} per punteggio
              </span>
            )}
          </div>
          <div className="buy-sell-list">
            {buyList.length === 0 ? (
              <div className="no-data" style={{ padding: 'var(--spacing-md)' }}>Nessun segnale di acquisto</div>
            ) : (
              buyList.map(h => (
                <div key={h.ticker} className="buy-sell-item">
                  <div className="buy-sell-item-header">
                    <div>
                      <span className="buy-sell-item-ticker">{h.ticker}</span>
                      <span className="buy-sell-item-company" style={{ marginLeft: '8px' }}>{h.company}</span>
                    </div>
                    <span className={`score-badge ${getScoreClass(h.overall_score)}`}>
                      {h.overall_score?.toFixed(1)}
                    </span>
                  </div>
                  <div className="buy-sell-item-reason">
                    {h.investors_holding} investitori
                    {h.consensus_score != null ? ` · Consenso: ${h.consensus_score}` : ''}
                    {h.new_position_count > 0 ? ` · Nuova posizione per ${h.new_position_count} investitori` : ''}
                    {h.sector ? ` · ${h.sector}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SELL column */}
        <div className="buy-sell-column sell-column-border">
          <div className="buy-sell-header sell">
            {'▼'} Vendi
            {!compact && (
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, marginLeft: '8px', opacity: 0.8 }}>
                Segnali di vendita attivi
              </span>
            )}
          </div>
          <div className="buy-sell-list">
            {sellList.length === 0 ? (
              <div className="no-data" style={{ padding: 'var(--spacing-md)' }}>Nessun segnale di vendita</div>
            ) : (
              sellList.map(s => (
                <div key={s.ticker} className="buy-sell-item">
                  <div className="buy-sell-item-header">
                    <div>
                      <span className="buy-sell-item-ticker">{s.ticker}</span>
                      <span className="buy-sell-item-company" style={{ marginLeft: '8px' }}>{s.company}</span>
                    </div>
                    <span style={{ color: 'var(--negative)', fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
                      {s.investors_selling} in uscita
                    </span>
                  </div>
                  <div className="buy-sell-item-reason">
                    {s.investors_selling} investitori in uscita
                    {s.avg_reduction != null ? ` · Riduzione media: ${Math.abs(s.avg_reduction).toFixed(1)}%` : ''}
                    {s.exiting_investors && s.exiting_investors.length > 0
                      ? ` · ${s.exiting_investors.join(', ')}`
                      : ''
                    }
                    {s.sector ? ` · ${s.sector}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
