import { useEffect, useState } from 'react';
import { useEffects } from '../hooks/useEffects';
import { useTheme } from '../hooks/useTheme';

export function Garland() {
  const { effectsEnabled } = useEffects();
  const { theme } = useTheme();
  const [bulbCount, setBulbCount] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Вычисляем количество лампочек в зависимости от ширины экрана
    const updateBulbCount = () => {
      const w = window.innerWidth;
      setWidth(w);
      setBulbCount(Math.ceil(w / 50)); // Примерно одна лампочка на 50px (в 2 раза реже)
    };

    updateBulbCount();
    window.addEventListener('resize', updateBulbCount);
    return () => window.removeEventListener('resize', updateBulbCount);
  }, []);

  // Если эффекты выключены, не рендерим гирлянду
  if (!effectsEnabled) {
    return null;
  }

  const colors = ['#FF6B6B', '#4ECDC4', '#FFD700', '#FFA07A', '#98D8C8', '#45B7D1'];
  const wireColor = theme === 'dark' ? '#666' : '#333';

  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none"
      style={{
        height: '30px', // Увеличена высота для провисания
        overflow: 'visible',
        zIndex: 9999, // Поверх всех элементов
      }}
    >
      <svg
        width="100%"
        height="30" // Увеличена высота SVG
        style={{
          display: 'block',
        }}
      >
        {/* Провод гирлянды с провисанием */}
        {width > 0 && (
          <path
            d={`M 0,8 Q ${width / 2},18 ${width},8`} // Увеличено провисание до 18px
            fill="none"
            stroke={wireColor}
            strokeWidth="1.5"
            opacity="0.4"
          />
        )}
        {/* Лампочки */}
        {Array.from({ length: bulbCount }).map((_, index) => {
          const xPercent = bulbCount > 1 ? (index / (bulbCount - 1)) * 100 : 50;
          const y = 8 + Math.sin((index / Math.max(1, bulbCount - 1)) * Math.PI) * 6; // Увеличено провисание до 6px
          const color = colors[index % colors.length];
          const delay = index * 0.15;

          return (
            <g key={index}>
              {/* Провод к лампочке */}
              <line
                x1={`${xPercent}%`}
                y1="8"
                x2={`${xPercent}%`}
                y2={y + 3}
                stroke={wireColor}
                strokeWidth="1"
                opacity="0.3"
              />
              {/* Лампочка */}
              <circle
                cx={`${xPercent}%`}
                cy={y + 3}
                r="4"
                fill={color}
                opacity="0.95"
              >
                <animate
                  attributeName="opacity"
                  values="0.6;1;0.6"
                  dur="1.5s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="r"
                  values="3.5;5;3.5"
                  dur="1.5s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
              </circle>
              {/* Свечение вокруг лампочки */}
              <circle
                cx={`${xPercent}%`}
                cy={y + 3}
                r="8"
                fill={color}
                opacity="0.4"
              >
                <animate
                  attributeName="opacity"
                  values="0.2;0.5;0.2"
                  dur="1.5s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="r"
                  values="6;10;6"
                  dur="1.5s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
