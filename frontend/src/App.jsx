import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import useData from './hooks/useData';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TopHoldings from './components/TopHoldings';
import ConsensusPicks from './components/ConsensusPicks';
import NewPositions from './components/NewPositions';
import ExitedPositions from './components/ExitedPositions';
import ConvictionRanking from './components/ConvictionRanking';
import InvestorDetail from './components/InvestorDetail';
import './App.css';

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard');
  const data = useData();

  if (data.loading) {
    return (
      <Layout activePage={activePage} setActivePage={setActivePage}>
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Caricamento dati in corso...</p>
        </div>
      </Layout>
    );
  }

  if (data.error) {
    return (
      <Layout activePage={activePage} setActivePage={setActivePage}>
        <div className="error-container">
          <p className="error-message">Errore nel caricamento dei dati</p>
          <p style={{ color: 'var(--text-secondary)' }}>{data.error}</p>
        </div>
      </Layout>
    );
  }

  const lastUpdated = data.summary?.metadata?.last_updated;

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard summary={data.summary} holdings={data.allHoldings} />;
      case 'top-holdings':
        return <TopHoldings data={data} />;
      case 'consensus':
        return <ConsensusPicks data={data} />;
      case 'new-positions':
        return <NewPositions data={data} />;
      case 'exited':
        return <ExitedPositions data={data} />;
      case 'conviction':
        return <ConvictionRanking data={data} />;
      case 'investor-detail':
        return <InvestorDetail data={data} />;
      default:
        return <Dashboard summary={data.summary} holdings={data.allHoldings} />;
    }
  };

  return (
    <Layout
      activePage={activePage}
      setActivePage={setActivePage}
      lastUpdated={lastUpdated}
    >
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
