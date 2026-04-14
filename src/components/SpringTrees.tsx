import { useEffect, useState } from 'react';
import { useEffects } from '../hooks/useEffects';
import sakuraTreeUrl from '../assets/SakuraTree.png';

/** Декор для весны: ряд деревьев сакуры в шапке. */
export function SpringTrees() {
  const { effectsEnabled } = useEffects();
  const [screenWidth, setScreenWidth] = useState(0);
  const [treeCount, setTreeCount] = useState(0);
  const TREE_HEIGHT = 38;
  const TREE_WIDTH = 190;
  const TREE_STEP = 118;

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      setTreeCount(Math.max(4, Math.ceil((width + TREE_WIDTH) / TREE_STEP)));
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  if (!effectsEnabled) {
    return null;
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{ height: '46px', zIndex: 9999 }}
    >
      <div className="relative w-full h-full">
        {Array.from({ length: treeCount }).map((_, index) => (
          <img
            key={index}
            src={sakuraTreeUrl}
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              left: `${index * TREE_STEP - 22}px`,
              top: '0',
              width: `${TREE_WIDTH}px`,
              height: `${TREE_HEIGHT}px`,
              objectFit: 'contain',
              opacity: 0.92,
            }}
          />
        ))}
        {screenWidth === 0 && null}
      </div>
    </div>
  );
}
