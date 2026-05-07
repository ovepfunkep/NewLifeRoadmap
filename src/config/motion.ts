import type { Transition } from 'framer-motion';

export const motionDurations = {
  fast: 0.18,
  medium: 0.28,
  slow: 0.38,
} as const;

export const motionEasing = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.16, 1, 0.3, 1] as const,
} as const;

export const motionTransitions = {
  fade: {
    duration: motionDurations.medium,
    ease: motionEasing.standard,
  } satisfies Transition,
  sheet: {
    type: 'spring',
    stiffness: 320,
    damping: 34,
    mass: 0.92,
  } satisfies Transition,
  modal: {
    type: 'spring',
    stiffness: 280,
    damping: 30,
    mass: 0.9,
  } satisfies Transition,
  itemSpring: {
    type: 'spring',
    stiffness: 360,
    damping: 32,
    mass: 0.9,
  } satisfies Transition,
} as const;
