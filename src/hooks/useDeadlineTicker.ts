import { useState, useEffect } from 'react';
import { Node } from '../types';
import { deadlineStatus } from '../utils';

// Хук для минутного тикера дедлайнов
export function useDeadlineTicker() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 60000); // 1 минута

    return () => clearInterval(interval);
  }, []);

  return tick;
}

// Получить статус дедлайна с учётом тикера
export function useDeadlineStatus(node: Node): ReturnType<typeof deadlineStatus> {
  useDeadlineTicker(); // подписка на тикер
  return deadlineStatus(node);
}

