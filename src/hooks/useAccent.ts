import { useSettings } from '../contexts/SettingsContext';

export function useAccent() {
  const { accent, setAccent, colors } = useSettings();
  return { accent, setAccent, colors };
}
