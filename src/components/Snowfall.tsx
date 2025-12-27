import { useEffect, useRef } from 'react';
import { useEffects } from '../hooks/useEffects';

interface Snowflake {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

export function Snowfall() {
  const { effectsEnabled } = useEffects();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const snowflakesRef = useRef<Snowflake[]>([]);

  useEffect(() => {
    if (!effectsEnabled) {
      // Очищаем canvas и останавливаем анимацию
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Устанавливаем размеры canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Инициализация снежинок
    const initSnowflakes = () => {
      const count = Math.floor((canvas.width * canvas.height) / 15000); // Адаптивное количество
      snowflakesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 2, // Фиксированный маленький размер
        speed: 0.4, // Фиксированная скорость
        opacity: Math.random() * 0.5 + 0.5, // Прозрачность от 0.5 до 1
      }));
    };

    initSnowflakes();

    // Анимация снежинок
    const animate = () => {
      if (!effectsEnabled) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      snowflakesRef.current.forEach((flake) => {
        // Обновляем позицию
        flake.y += flake.speed;
        flake.x += Math.sin(flake.y * 0.005) * 0.2; // Более плавное и медленное покачивание

        // Если снежинка упала вниз, возвращаем её наверх
        if (flake.y > canvas.height) {
          flake.y = -10;
          flake.x = Math.random() * canvas.width;
        }

        // Если снежинка ушла в сторону, возвращаем её
        if (flake.x < -10) {
          flake.x = canvas.width + 10;
        } else if (flake.x > canvas.width + 10) {
          flake.x = -10;
        }

        // Рисуем снежинку
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [effectsEnabled]);

  // Если эффекты выключены, не рендерим canvas
  if (!effectsEnabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 pointer-events-none"
      style={{
        zIndex: 9998, // Ниже гирлянды, но поверх контента
      }}
    />
  );
}



