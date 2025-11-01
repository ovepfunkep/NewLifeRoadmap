import React, { useEffect } from 'react';
import { NodePage } from './pages/NodePage';
import { useTheme } from './hooks/useTheme';
import { useAccent } from './hooks/useAccent';
import './index.css';

function App() {
  const { theme } = useTheme();
  const { accent } = useAccent();

  useEffect(() => {
    // Инициализация темы и акцента
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  return <NodePage />;
}

export default App;

