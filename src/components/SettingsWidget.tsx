import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useAccent } from '../hooks/useAccent';
import { useEffects } from '../hooks/useEffects';
import { useLanguage } from '../contexts/LanguageContext';
import { FiSun, FiMoon } from 'react-icons/fi';
import { FaGraduationCap } from 'react-icons/fa';
import { SparklesIcon } from './SparklesIcon';
import { recreateTutorial } from '../db';
import { useToast } from '../hooks/useToast';

type Language = 'ru' | 'en';

interface SettingsWidgetProps {
  onLanguageChange?: (lang: Language) => void;
}

export function SettingsWidget({ onLanguageChange }: SettingsWidgetProps) {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent, colors } = useAccent();
  const { effectsEnabled, setEffectsEnabled } = useEffects();
  const { language, setLanguage } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
        setShowPalette(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const radius = 70; // Радиус 70px
  const gearSize = 32; // Размер шестеренки
  const paletteWidth = 280; // Ширина палитры цветов

  // Проверяем, находится ли курсор в пределах радиуса (с учетом палитры)
  useEffect(() => {
    if (!isExpanded || !containerRef.current || isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Центр контейнера = центр спиннера
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Расширяем область: если показывается палитра, учитываем её ширину
      const effectiveRadius = showPalette ? radius + paletteWidth : radius;
      
      const distance = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
      );
      
      // Очищаем предыдущий таймер
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Если курсор выходит за пределы расширенного радиуса + отступ, планируем сворачивание
      if (distance > effectiveRadius + 50) { // Увеличиваем отступ
        timeoutRef.current = window.setTimeout(() => {
          // Дополнительная проверка перед сворачиванием
          if (containerRef.current) {
            const finalRect = containerRef.current.getBoundingClientRect();
            const finalCenterX = finalRect.left + finalRect.width / 2;
            const finalCenterY = finalRect.top + finalRect.height / 2;
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const finalEffectiveRadius = showPalette ? radius + paletteWidth : radius;
            const finalDistance = Math.sqrt(
              Math.pow(mouseX - finalCenterX, 2) + Math.pow(mouseY - finalCenterY, 2)
            );
            if (finalDistance > finalEffectiveRadius + 50) {
              setIsExpanded(false);
              setShowPalette(false);
            }
          }
        }, 150);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isExpanded, radius, showPalette, paletteWidth, isMobile]);

  const handleThemeClick = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleLanguageClick = async () => {
    const newLang = language === 'ru' ? 'en' : 'ru';
    setLanguage(newLang);
    onLanguageChange?.(newLang);
  };

  const ColorIcon = () => (
    <div 
      className="w-4 h-4 rounded border-2 border-current" 
      style={{ backgroundColor: accent }}
    />
  );

  const handleEffectsClick = async () => {
    const newEffectsEnabled = !effectsEnabled;
    setEffectsEnabled(newEffectsEnabled);
  };

  const handleRefreshMemory = async () => {
    try {
      await recreateTutorial();
      showToast(language === 'ru' ? 'Окей. Туториал добавлен в корень.' : 'Okay. Tutorial added to root.', undefined, { type: 'success' });
      window.dispatchEvent(new CustomEvent('syncManager:dataUpdated'));
      setIsExpanded(false);
    } catch (e: any) {
      if (e.message === 'DUPLICATE_TUTORIAL') {
        showToast(language === 'ru' ? 'Туториал уже есть в списке.' : 'Tutorial is already in the list.', undefined, { type: 'warning' });
      } else {
        showToast(language === 'ru' ? 'Не получилось создать туториал. Попробуй ещё раз.' : 'Failed to recreate tutorial. Try again.', undefined, { type: 'error' });
      }
    }
  };

  const LanguageIcon = () => (
    <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
      {language.toUpperCase()}
    </span>
  );

  const EffectsIcon = () => (
    <SparklesIcon 
      size={18}
      style={{ 
        color: effectsEnabled ? 'white' : 'var(--accent)',
        transition: 'all 0.5s ease',
      }} 
    />
  );

  // Мемоизируем buttonPositions, чтобы они обновлялись при изменении настроек
  const buttonPositions = useMemo(() => {
    // Распределяем 5 кнопок на 360 градусов
    const angles = [270, 342, 54, 126, 198]; // 360 / 5 = 72 градуса шаг
    return [
      { angle: angles[0], icon: theme === 'light' ? FiSun : FiMoon, action: handleThemeClick, label: language === 'en' ? 'Theme' : 'Тема' },
      { angle: angles[1], icon: LanguageIcon, action: handleLanguageClick, label: language === 'en' ? 'Language' : 'Язык' },
      { angle: angles[2], icon: ColorIcon, action: () => setShowPalette(!showPalette), label: language === 'en' ? 'Color' : 'Цвет' },
      { angle: angles[3], icon: EffectsIcon, action: handleEffectsClick, label: language === 'en' ? 'Effects' : 'Эффекты' },
      { angle: angles[4], icon: FaGraduationCap, action: handleRefreshMemory, label: language === 'en' ? 'Tutorial' : 'Туториал' },
    ];
  }, [theme, accent, language, effectsEnabled, handleLanguageClick, handleEffectsClick, showPalette]);

  return (
    <div 
      ref={containerRef}
      className="fixed flex items-center justify-center"
      style={{ 
        width: isMobile ? '48px' : `${radius * 2}px`,
        height: isMobile ? '48px' : `${radius * 2}px`,
        right: '1.5rem',
        bottom: '1.5rem',
        zIndex: 40,
      }}
    >
      {/* Шестеренка (свернутое состояние) - отцентрирована внутри контейнера */}
      <div
        className="absolute flex items-center justify-center transition-all duration-[333ms] ease-in-out backdrop-blur-md bg-white/30 dark:bg-gray-900/30 border border-gray-300/50 dark:border-gray-800/50 rounded-2xl shadow-lg hover:shadow-xl hover:bg-white/40 dark:hover:bg-gray-900/40"
        style={{
          width: `${gearSize + 16}px`,
          height: `${gearSize + 16}px`,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: isExpanded ? 0 : 1,
          pointerEvents: isExpanded ? 'none' : 'auto',
          cursor: 'pointer',
          zIndex: 20,
        }}
        onMouseEnter={() => {
          if (!isExpanded && !isMobile) {
            setIsExpanded(true);
          }
        }}
        onClick={() => {
          if (isMobile) {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <svg
          width={gearSize}
          height={gearSize}
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: 'var(--accent)' }}
          className="transition-colors"
        >
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Спиннер с кнопками (развернутое состояние) - отцентрирован внутри контейнера */}
      <div
        className="absolute flex items-center justify-center transition-all duration-[333ms] ease-in-out"
        style={{
          width: '100%',
          height: '100%',
          left: '50%',
          top: '50%',
          transform: isExpanded 
            ? `translate(-50%, -50%) scale(1) ${isMobile ? '' : 'rotate(360deg)'}` 
            : 'translate(-50%, -50%) scale(0) rotate(0deg)',
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
        onMouseEnter={() => {
          if (isExpanded && timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }}
        onClick={() => {
          if (isMobile) {
            setIsExpanded(false);
            setShowPalette(false);
          }
        }}
      >
        {/* Центральная точка (только на десктопе) */}
        {!isMobile && (
          <div 
            className="absolute rounded-full bg-gray-400 dark:bg-gray-600 transition-all duration-[333ms]"
            style={{
              width: isExpanded ? '12px' : '8px',
              height: isExpanded ? '12px' : '8px',
              left: '50%',
              top: '50%',
              opacity: isExpanded ? 1 : 0,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        
        {/* Линии спиннера (только на десктопе) */}
        {!isMobile && (
          <svg 
            className="absolute pointer-events-none" 
            style={{ 
              color: 'var(--accent)',
              width: '100%',
              height: '100%',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            viewBox={`0 0 ${radius * 2} ${radius * 2}`}
          >
            {buttonPositions.map((pos, idx) => {
              const rad = (pos.angle * Math.PI) / 180;
              const centerX = radius;
              const centerY = radius;
              const lineLength = radius - 20;
              const x1 = centerX;
              const y1 = centerY;
              const x2 = centerX + (lineLength - 20) * Math.cos(rad);
              const y2 = centerY + (lineLength - 20) * Math.sin(rad);
              
              return (
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="transition-opacity duration-[333ms]"
                  style={{ opacity: isExpanded ? 0.6 : 0 }}
                />
              );
            })}
          </svg>
        )}

        {/* Кнопки на концах */}
        {buttonPositions.map((pos, idx) => {
          const rad = (pos.angle * Math.PI) / 180;
          const buttonRadius = radius - 20;
          const Icon = pos.icon;
          const isEffectsBtn = idx === 3;
          const isActive = isEffectsBtn && effectsEnabled;

          const transform = isExpanded 
            ? isMobile
              ? `translate(-50%, calc(-50% - ${(idx + 1) * 48}px)) scale(1)`
              : `translate(calc(-50% + ${buttonRadius * Math.cos(rad)}px), calc(-50% + ${buttonRadius * Math.sin(rad)}px)) scale(1)`
            : 'translate(-50%, -50%) scale(0)';

          return (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                pos.action();
              }}
              className={`absolute w-10 h-10 rounded-lg border-2 transition-all duration-[333ms] flex items-center justify-center group z-10 shadow-lg backdrop-blur-md ${
                isActive
                  ? 'border-transparent'
                  : 'border-current hover:bg-accent/10 hover:brightness-150'
              }`}
              style={{
                left: '50%',
                top: '50%',
                color: 'var(--accent)',
                backgroundColor: isActive 
                  ? 'var(--accent)' 
                  : (theme === 'light' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(31, 41, 55, 0.7)'),
                transform,
                opacity: isExpanded ? 1 : 0,
                transition: 'transform 333ms ease-in-out, opacity 333ms ease-in-out, background-color 0.5s ease',
              }}
            >
              <Icon size={20} />
              {/* Tooltip (только на десктопе) */}
              {!isMobile && (
                <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-600 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-lg border border-gray-200 dark:border-gray-700">
                  {pos.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Палитра цветов */}
      {showPalette && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPalette(false)}
          />
          <div 
            className="absolute z-50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-lg shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => {
              if (timeoutRef.current !== null && !isMobile) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
            }}
            style={{
              right: isMobile ? 'calc(100% + 1rem)' : 'calc(100% + 0.5rem)',
              bottom: isMobile ? '0' : 'auto',
              top: isMobile ? 'auto' : '50%',
              transform: isMobile ? 'none' : 'translateY(-50%)',
              padding: '12px',
              display: 'inline-block',
            }}
          >
            <div 
              className={`grid ${isMobile ? 'grid-cols-4' : 'grid-cols-2'} gap-2 sm:flex sm:flex-wrap`}
              style={{ 
                gap: '8px',
                width: 'max-content',
              }}
            >
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setAccent(color);
                    setShowPalette(false);
                    if (isMobile) setIsExpanded(false);
                  }}
                  className={`rounded border-2 transition-all hover:brightness-150 flex-shrink-0 ${
                    accent === color
                      ? 'border-gray-900 dark:border-gray-100 scale-110'
                      : 'border-gray-300 dark:border-gray-700 hover:scale-105'
                  }`}
                  style={{ 
                    backgroundColor: color,
                    width: '36px',
                    height: '36px',
                    minWidth: '36px',
                    minHeight: '36px',
                  }}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
