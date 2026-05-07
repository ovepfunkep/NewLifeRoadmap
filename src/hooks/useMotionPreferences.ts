import { useReducedMotion } from 'framer-motion';
import { useEffects } from './useEffects';

export function useMotionPreferences() {
  const shouldReduceMotion = useReducedMotion();
  const { effectsEnabled } = useEffects();

  return {
    shouldReduceMotion,
    effectsEnabled,
    allowEssentialMotion: !shouldReduceMotion,
    allowDecorativeMotion: effectsEnabled && !shouldReduceMotion,
  };
}
