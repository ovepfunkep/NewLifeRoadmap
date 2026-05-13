import { useState, useEffect } from 'react';

/** Tracks viewport width vs breakpoint (default: md / 768). */
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpointPx);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpointPx]);

  return isMobile;
}
