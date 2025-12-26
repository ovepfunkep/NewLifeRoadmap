import { useSettings } from '../contexts/SettingsContext';

export function useEffects() {
  const { effectsEnabled, setEffectsEnabled } = useSettings();
  return { effectsEnabled, setEffectsEnabled };
}
