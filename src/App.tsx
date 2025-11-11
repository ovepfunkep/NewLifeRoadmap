import { useEffect } from 'react';
import { NodePage } from './pages/NodePage';
import { SyncManager } from './components/SyncManager';
import { SettingsSyncManager } from './components/SettingsSyncManager';
import { Garland } from './components/Garland';
import { LanguageProvider } from './contexts/LanguageContext';
import { useAccent } from './hooks/useAccent';
import './index.css';

function App() {
  const { accent } = useAccent();

  useEffect(() => {
    // Инициализация темы и акцента
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  return (
    <LanguageProvider>
      <SettingsSyncManager />
      <Garland />
      <NodePage />
      <SyncManager />
    </LanguageProvider>
  );
}

export default App;

