import { useState, useRef, useEffect } from 'react';

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayText = selected.length === 0
    ? 'Tutti'
    : selected.length <= 2
      ? selected.join(', ')
      : `${selected.length} selezionati`;

  return (
    <div className="multi-select" ref={ref}>
      <div className="multi-select-trigger" onClick={() => setOpen(o => !o)}>
        <span>{displayText}</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="multi-select-dropdown">
          {options.map(opt => (
            <label key={opt} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Filters({
  search, setSearch,
  sectors, setSectors,
  marketCaps, setMarketCaps,
  minScore, setMinScore,
  allSectors, allMarketCaps,
  resetFilters
}) {
  const capOrder = ['Mega', 'Large', 'Mid', 'Small'];
  const orderedCaps = capOrder.filter(c => allMarketCaps.includes(c));

  return (
    <div className="filters-bar">
      <div className="filter-group">
        <span className="filter-label">Cerca</span>
        <input
          type="text"
          className="filter-input"
          placeholder="Ticker o azienda..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">Settore</span>
        <MultiSelect
          label="Settore"
          options={allSectors}
          selected={sectors}
          onChange={setSectors}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">Market Cap</span>
        <div className="toggle-group">
          {orderedCaps.map(cap => (
            <button
              key={cap}
              className={`toggle-btn ${marketCaps.includes(cap) ? 'active' : ''}`}
              onClick={() => {
                if (marketCaps.includes(cap)) {
                  setMarketCaps(marketCaps.filter(c => c !== cap));
                } else {
                  setMarketCaps([...marketCaps, cap]);
                }
              }}
            >
              {cap}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Score minimo</span>
        <div className="filter-slider">
          <input
            type="range"
            min="0"
            max="100"
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
          />
          <span className="filter-slider-value">{minScore}</span>
        </div>
      </div>

      <button className="btn-reset" onClick={resetFilters}>
        ↺ Reset
      </button>
    </div>
  );
}
