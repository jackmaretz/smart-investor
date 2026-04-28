import ThemeToggle from './ThemeToggle';
import ViewToggle from './ViewToggle';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◉' },
  { id: 'top-holdings', label: 'Top Holdings', icon: '★' },
  { id: 'consensus', label: 'Consensus Picks', icon: '◎' },
  { id: 'new-positions', label: 'Nuove Posizioni', icon: '⊕' },
  { id: 'exited', label: 'Posizioni Chiuse', icon: '⊖' },
  { id: 'conviction', label: 'Ranking Convinzione', icon: '▰' },
  { id: 'investor-detail', label: 'Dettaglio Investitori', icon: '⊙' },
];

export default function Sidebar({ activePage, setActivePage, isOpen, onClose, lastUpdated }) {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">Smart<span>Investor</span></div>
          <div className="sidebar-subtitle">Analisi Portafogli</div>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => { setActivePage(item.id); onClose(); }}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-toggle-row">
            <ThemeToggle />
            <ViewToggle />
          </div>
          {lastUpdated && (
            <div className="sidebar-meta">
              Aggiornato: {new Date(lastUpdated).toLocaleDateString('it-IT')}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
