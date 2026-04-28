import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('si-theme') || 'light';
    } catch {
      return 'light';
    }
  });

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('si-view') || 'minimal';
    } catch {
      return 'minimal';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('si-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-view', viewMode);
    try { localStorage.setItem('si-view', viewMode); } catch {}
  }, [viewMode]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));
  const toggleViewMode = () => setViewMode(v => (v === 'minimal' ? 'dense' : 'minimal'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, viewMode, toggleViewMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
