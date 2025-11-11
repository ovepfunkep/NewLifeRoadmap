import { useEffect } from 'react';
import { NodePage } from './pages/NodePage';
import { SyncManager } from './components/SyncManager';
import { SettingsSyncManager } from './components/SettingsSyncManager';
import { Garland } from './components/Garland';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider, useToast } from './hooks/useToast';
import { ToastList } from './components/ToastList';
import { useAccent } from './hooks/useAccent';
import './index.css';

function AppContent() {
  const { accent } = useAccent();
  const { toasts, removeToast } = useToast();

  useEffect(() => {
    // Инициализация темы и акцента
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  return (
    <>
      <SettingsSyncManager />
      <Garland />
      <NodePage />
      <SyncManager />
      <ToastList toasts={toasts} onRemove={removeToast} />
    </>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;

