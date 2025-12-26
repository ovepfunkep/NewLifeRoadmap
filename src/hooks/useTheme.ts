import { useSettings } from '../contexts/SettingsContext';

export function useTheme() {
  const { theme, setTheme } = useSettings();
  return { theme, setTheme };
}
