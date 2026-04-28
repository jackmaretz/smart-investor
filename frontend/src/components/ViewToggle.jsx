import { useTheme } from '../context/ThemeContext';

export default function ViewToggle() {
  const { viewMode, toggleViewMode } = useTheme();
  return (
    <button className="view-toggle" onClick={toggleViewMode} title="Cambia modalità vista">
      {viewMode === 'minimal' ? '▦' : '▢'}{' '}
      <span>{viewMode === 'minimal' ? 'Denso' : 'Minimale'}</span>
    </button>
  );
}
