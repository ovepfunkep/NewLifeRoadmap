import { useState, useEffect, useCallback } from 'react';

export function useHashRoute(): string | null {
  const [nodeId, setNodeId] = useState<string | null>(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#\/node\/(.+)$/);
    return match ? match[1] : null;
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#\/node\/(.+)$/);
      setNodeId(match ? match[1] : null);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return nodeId;
}

// Расширенный хук с навигацией
export function useNodeNavigation(): [string | null, (id: string | null) => void] {
  const nodeId = useHashRoute();
  
  const navigateToNode = useCallback((id: string | null) => {
    if (id) {
      window.location.hash = `#/node/${id}`;
    } else {
      window.location.hash = '';
    }
  }, []);

  return [nodeId, navigateToNode];
}
