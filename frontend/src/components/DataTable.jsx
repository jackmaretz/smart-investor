import { useState } from 'react';
import InfoTooltip from './InfoTooltip';

// --- Number formatting utilities ---

export function formatNumber(val, locale = 'it-IT') {
  if (val == null || isNaN(val)) return '—';
  return val.toLocaleString(locale);
}

export function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function formatPercent(val) {
  if (val == null || isNaN(val)) return '—';
  return `${(val).toFixed(1)}%`;
}

export function formatPercentFromDecimal(val) {
  if (val == null || isNaN(val)) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

export function formatPrice(val) {
  if (val == null || isNaN(val)) return '—';
  return `$${val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRatio(val) {
  if (val == null || isNaN(val)) return '—';
  if (val < 0) return `${val.toFixed(1)}`;
  return val.toFixed(1);
}

export function getScoreClass(score) {
  if (score >= 80) return 'score-excellent';
  if (score >= 65) return 'score-good';
  if (score >= 45) return 'score-average';
  if (score >= 25) return 'score-below';
  return 'score-poor';
}

export function getChangeIndicator(change) {
  switch (change) {
    case 'increased': return { symbol: '▲', className: 'change-increased', label: 'Aumentata' };
    case 'decreased': return { symbol: '▼', className: 'change-decreased', label: 'Ridotta' };
    case 'new': return { symbol: '●', className: 'change-new', label: 'Nuova' };
    case 'exited': return { symbol: '✕', className: 'change-exited', label: 'Uscita' };
    default: return { symbol: '—', className: 'change-unchanged', label: 'Invariata' };
  }
}

export default function DataTable({
  columns,
  data,
  sortKey,
  sortDir,
  onSort,
  expandable = false,
  renderExpanded,
  keyField = 'ticker',
  emptyMessage = 'Nessun dato disponibile'
}) {
  const [expandedRow, setExpandedRow] = useState(null);

  if (!data || data.length === 0) {
    return <div className="no-data">{emptyMessage}</div>;
  }

  const handleRowClick = (row) => {
    if (!expandable) return;
    setExpandedRow(prev => prev === row[keyField] ? null : row[keyField]);
  };

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => {
              const isSorted = sortKey === col.key;
              const cls = isSorted
                ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc')
                : '';
              return (
                <th
                  key={col.key}
                  className={cls}
                  onClick={() => onSort && onSort(col.key)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                  {col.tooltipKey && <InfoTooltip metricKey={col.tooltipKey} />}
                  {onSort && (
                    <span className="sort-indicator">
                      {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map(row => {
            const isExpanded = expandedRow === row[keyField];
            return (
              <RowGroup
                key={row[keyField]}
                row={row}
                columns={columns}
                expandable={expandable}
                isExpanded={isExpanded}
                onClick={() => handleRowClick(row)}
                renderExpanded={renderExpanded}
                colCount={columns.length}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowGroup({ row, columns, expandable, isExpanded, onClick, renderExpanded, colCount }) {
  return (
    <>
      <tr
        className={`${expandable ? 'expandable' : ''} ${isExpanded ? 'expanded-row' : ''}`}
        onClick={onClick}
      >
        {columns.map(col => (
          <td key={col.key}>
            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
          </td>
        ))}
      </tr>
      {isExpanded && renderExpanded && (
        <tr className="expanded-row">
          <td colSpan={colCount} style={{ padding: 0 }}>
            <div className="expanded-content">
              {renderExpanded(row)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
