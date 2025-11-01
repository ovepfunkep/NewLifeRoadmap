import React, { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useAccent } from '../hooks/useAccent';
import { FiSun, FiMoon } from 'react-icons/fi';

export function ThemeAccentControls() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent, colors } = useAccent();
  const [showPalette, setShowPalette] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {/* Переключатель темы */}
      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="p-2 rounded-lg transition-all border border-current hover:bg-accent/10"
        style={{ 
          color: 'var(--accent)',
          backgroundColor: 'transparent'
        }}
        aria-label={theme === 'light' ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
      >
        {theme === 'light' ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>

      {/* Акцентный цвет */}
      <div className="relative">
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-700 hover:shadow-md transition-shadow"
          style={{ backgroundColor: accent }}
          aria-label="Выбрать акцентный цвет"
        />
        
        {showPalette && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPalette(false)}
            />
            <div className="absolute right-0 top-full mt-2 z-50 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[280px]">
              <div className="grid grid-cols-4 gap-2 w-full">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setAccent(color);
                      setShowPalette(false);
                    }}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      accent === color
                        ? 'border-gray-900 dark:border-gray-100 scale-110'
                        : 'border-gray-300 dark:border-gray-700 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Выбрать цвет ${color}`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
