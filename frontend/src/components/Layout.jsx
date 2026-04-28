import { useState } from 'react';
import Sidebar from './Sidebar';

export default function Layout({ activePage, setActivePage, lastUpdated, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <button
        className="mobile-hamburger"
        onClick={() => setSidebarOpen(o => !o)}
        aria-label="Menu"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        lastUpdated={lastUpdated}
      />

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
