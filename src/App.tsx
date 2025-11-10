import { useEffect } from 'react';
import { NodePage } from './pages/NodePage';
import { SyncManager } from './components/SyncManager';
import { useAccent } from './hooks/useAccent';
import './index.css';

function App() {
  const { accent } = useAccent();

  useEffect(() => {
    // Инициализация темы и акцента
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  return (
    <>
      <NodePage />
      <SyncManager />
    </>
  );
}

export default App;

