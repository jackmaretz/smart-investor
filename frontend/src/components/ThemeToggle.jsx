import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggleTheme} title="Cambia tema">
      {theme === 'light' ? '☾' : '☀'}{' '}
      <span>{theme === 'light' ? 'Scuro' : 'Chiaro'}</span>
    </button>
  );
}
