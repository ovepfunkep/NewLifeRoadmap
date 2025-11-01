import React, { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useAccent } from '../hooks/useAccent';
import { t } from '../i18n';

export function ThemeAccentControls() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent, colors } = useAccent();
  const [showPalette, setShowPalette] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {/* Переключатель темы */}
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
        <option value="system">{t('theme.system')}</option>
      </select>

      {/* Акцентный цвет */}
      <div className="relative">
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
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

