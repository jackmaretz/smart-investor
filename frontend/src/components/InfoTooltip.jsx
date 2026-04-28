import { useState, useRef, useEffect } from 'react';

const METRIC_EXPLANATIONS = {
  overall_score: "Punteggio complessivo (0-100) che combina consenso, convinzione, nuove posizioni e momentum",
  consensus_score: "Percentuale ponderata di investitori top che detengono questo titolo. Piu' alto = piu' investitori concordano",
  conviction_score: "Peso medio nel portafoglio degli investitori che lo detengono. Alto = forte convinzione",
  momentum_score: "Allineamento tra trend di prezzo e pattern di acquisto degli investitori",
  new_position_bonus: "Bonus quando 3+ investitori aprono nuova posizione nello stesso trimestre",
  investors_holding: "Numero di investitori monitorati che detengono questo titolo",
  avg_portfolio_weight: "Peso medio percentuale nei portafogli degli investitori che lo detengono",
  pe_ratio: "Rapporto Prezzo/Utili. Basso = potenzialmente sottovalutato. Negativo = azienda in perdita",
  revenue_growth: "Crescita dei ricavi anno su anno",
  profit_margin: "Margine di profitto netto",
  market_cap: "Capitalizzazione di mercato: Mega (>200B), Large (10-200B), Mid (2-10B), Small (<2B)",
  sector: "Settore industriale dell'azienda",
  quarter_change: "Variazione rispetto al trimestre precedente: se gli investitori stanno comprando o vendendo",
  total_value: "Valore totale detenuto da tutti gli investitori monitorati (in migliaia di $)",
  total_value_held: "Valore totale detenuto da tutti gli investitori monitorati",
  investors_analyzed: "Numero totale di super investitori i cui portafogli 13F sono analizzati",
  unique_holdings: "Numero di titoli distinti detenuti da almeno un investitore monitorato",
  top_10_avg: "Media del punteggio complessivo dei 10 titoli con il punteggio piu' alto",
  total_portfolio_value: "Valore complessivo di tutti i portafogli monitorati combinati (AUM totale)",
  company: "Nome dell'azienda quotata",
  ticker: "Simbolo del titolo in borsa",
  agreement_pct: "Percentuale di investitori monitorati che detengono il titolo",
  total_investors: "Numero totale di investitori monitorati nel sistema",
};

export { METRIC_EXPLANATIONS };

export default function InfoTooltip({ metricKey, text }) {
  const [visible, setVisible] = useState(false);
  const [positionBelow, setPositionBelow] = useState(false);
  const iconRef = useRef(null);
  const tooltipRef = useRef(null);

  const explanation = text || METRIC_EXPLANATIONS[metricKey] || '';
  if (!explanation) return null;

  useEffect(() => {
    if (visible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      // If near top of viewport, show below
      setPositionBelow(rect.top < 120);
    }
  }, [visible]);

  // Close on click outside (mobile)
  useEffect(() => {
    if (!visible) return;
    function handleClickOutside(e) {
      if (
        iconRef.current && !iconRef.current.contains(e.target) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target)
      ) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible]);

  return (
    <span className="info-tooltip-wrapper">
      <span
        ref={iconRef}
        className="info-tooltip-icon"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => { e.stopPropagation(); setVisible(v => !v); }}
      >
        {'ⓘ'}
      </span>
      {visible && (
        <span
          ref={tooltipRef}
          className={`info-tooltip-popup ${positionBelow ? 'below' : ''}`}
        >
          {explanation}
        </span>
      )}
    </span>
  );
}
