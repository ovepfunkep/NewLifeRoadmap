import { useEffect, useState } from 'react';
import { useEffects } from '../hooks/useEffects';
import { useTheme } from '../hooks/useTheme';

export function Garland() {
  const { effectsEnabled } = useEffects();
  const { theme } = useTheme();
  const [bulbCount, setBulbCount] = useState(0);
  const [width, setWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Вычисляем количество лампочек в зависимости от ширины экрана
    const updateBulbCount = () => {
      const w = window.innerWidth;
      setWidth(w);
      const mobile = w < 768;
      setIsMobile(mobile);
      setBulbCount(Math.ceil(w / (mobile ? 80 : 50))); // Реже на мобилках
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
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{
        height: '30px',
        zIndex: 9999,
      }}
    >
      <svg
        width="100%"
        height="30"
        style={{
          display: 'block',
          maxWidth: '100vw',
        }}
      >
        {/* Провод гирлянды с провисанием */}
        {width > 0 && (
          <path
            d={`M 0,8 Q ${width / 2},${isMobile ? 14 : 18} ${width},8`} // Меньше провисание на мобилках
            fill="none"
            stroke={wireColor}
            strokeWidth={isMobile ? "1" : "1.5"}
            opacity="0.4"
          />
        )}
        {/* Лампочки */}
        {Array.from({ length: bulbCount }).map((_, index) => {
          const xPercent = bulbCount > 1 ? (index / (bulbCount - 1)) * 100 : 50;
          const y = 8 + Math.sin((index / Math.max(1, bulbCount - 1)) * Math.PI) * (isMobile ? 4 : 6);
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
                r={isMobile ? "3" : "4"}
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
                  values={isMobile ? "2.5;3.5;2.5" : "3.5;5;3.5"}
                  dur="1.5s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
              </circle>
              {/* Свечение вокруг лампочки */}
              <circle
                cx={`${xPercent}%`}
                cy={y + 3}
                r={isMobile ? "6" : "8"}
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
                  values={isMobile ? "4;8;4" : "6;10;6"}
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
