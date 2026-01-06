import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useEffects } from '../hooks/useEffects';

const isDev = import.meta.env.DEV;

function log(message: string, ...args: any[]) {
  // Debug logging disabled
}

interface ConfettiEffectProps {
  trigger: number; // Изменено на number для поддержки нескольких запусков
  childCount?: number;
}

// Глобальная переменная для отслеживания последнего обработанного триггера
// Она не сбрасывается при перемонтировании компонента
let globalLastTrigger = 0;
let globalIsLaunching = false;

export function ConfettiEffect({ trigger, childCount = 0 }: ConfettiEffectProps) {
  const { effectsEnabled } = useEffects();
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    log('ConfettiEffect useEffect triggered', { trigger, childCount, globalLastTrigger, globalIsLaunching, effectsEnabled });
    
    // Если эффекты выключены, не запускаем конфетти
    if (!effectsEnabled) {
      log('Effects disabled, skipping confetti');
      return;
    }
    
    // Запускаем конфетти только если trigger увеличился (новый запуск) и мы не запускаем уже
    if (trigger === 0 || trigger <= globalLastTrigger || globalIsLaunching) {
      log('Trigger not increased or already launching, skipping confetti');
      if (trigger > globalLastTrigger) {
        globalLastTrigger = trigger;
      }
      return;
    }
    
    // Устанавливаем флаг запуска
    globalIsLaunching = true;
    // Обновляем предыдущее значение триггера
    globalLastTrigger = trigger;

    log('Creating confetti canvas');
    // Создаем или используем существующий canvas для конфетти
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '9999';
      canvas.style.opacity = '1';
      canvas.style.transition = 'opacity 2s ease-out';
      document.body.appendChild(canvas);
      canvasRef.current = canvas;
      log('Canvas appended to body');
    } else {
      // Если canvas уже существует, сбрасываем opacity для нового запуска
      canvas.style.opacity = '1';
      log('Using existing canvas');
    }

    const myConfetti = confetti.create(canvas, {
      resize: true,
      useWorker: true,
    });

    // Количество частиц зависит от количества подзадач
    const particleCount = Math.min(200, childCount * 8 + 50); // Увеличено количество частиц
    log(`Particle count: ${particleCount}`);

    // Конфетти вылетает с боков экрана и падает вниз
    const leftSide = () => {
      log('Launching confetti from left side');
      myConfetti({
        particleCount: Math.floor(particleCount * 0.5),
        angle: 60,
        spread: 120, // Увеличен разброс для покрытия всего экрана
        origin: { x: -0.1, y: 0.3 }, // Немного выше для лучшего разброса
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'],
        gravity: 0.3,
        drift: 0, // Увеличен drift для большего разброса
        ticks: 30000, // Увеличено до 20000 тиков для 20 секунд падения
        startVelocity: 60, // Немного увеличена скорость для лучшего разброса
        decay: 0.92,
      });
    };

    const rightSide = () => {
      log('Launching confetti from right side');
      myConfetti({
        particleCount: Math.floor(particleCount * 0.5),
        angle: 120, // Правильный угол для правой стороны
        spread: 120, // Увеличен разброс для покрытия всего экрана
        origin: { x: 1.1, y: 0.3 }, // Немного выше для лучшего разброса
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'],
        gravity: 0.3,
        drift: 0, // Увеличен drift для большего разброса
        ticks: 30000, // Увеличено до 20000 тиков для 20 секунд падения
        startVelocity: 60, // Немного увеличена скорость для лучшего разброса
        decay: 0.92,
      });
    };

    // Запускаем конфетти с обеих сторон с небольшой задержкой
    log('Starting confetti launch');
    leftSide();
    setTimeout(() => {
      rightSide();
      log('Right side confetti launched');
      // Сбрасываем флаг запуска после небольшой задержки, чтобы предотвратить повторные запуски
      setTimeout(() => {
        globalIsLaunching = false;
        log('Launch flag reset');
      }, 500);
    }, 150);

    // Плавное затухание и удаление canvas после завершения анимации
    // Сначала плавно затухаем через 28 секунд (30 секунд анимации - 2 секунды затухания)
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    fadeTimeoutRef.current = setTimeout(() => {
      log('Starting fade out');
      if (canvas instanceof HTMLCanvasElement && document.body.contains(canvas)) {
        canvas.style.opacity = '0';
      }
    }, 28000); // Начинаем затухание за 2 секунды до конца анимации

    // Удаляем canvas после завершения затухания
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }
    cleanupTimeoutRef.current = setTimeout(() => {
      log('Cleaning up canvas');
      if (canvas instanceof HTMLCanvasElement && document.body.contains(canvas)) {
        try {
          document.body.removeChild(canvas);
          canvasRef.current = null;
          log('Canvas removed successfully');
        } catch (error) {
          log('Error removing canvas:', error);
        }
      }
    }, 32000); // 32 секунды для полного затухания

    return () => {
      log('Cleanup function called');
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      // Не удаляем canvas в cleanup, чтобы он мог использоваться для следующих запусков
    };
  }, [trigger, childCount, effectsEnabled]); // Добавляем effectsEnabled в зависимости

  return null;
}
