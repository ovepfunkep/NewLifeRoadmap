import { useEffect, useRef } from 'react';
import { useEffects } from '../hooks/useEffects';
import { useTheme } from '../hooks/useTheme';
import sakuraPetalUrl from '../assets/SakuraLeaf.png';

interface Petal {
  x: number;
  y: number;
  /** Случайный сдвиг нейтрали (рад), листок в среднем почти горизонтально */
  baseTilt: number;
  /** Фаза качания: cos(phase) → дрейф влево-вправо и крен в ту же сторону */
  swayPhase: number;
  /** Скорость фазы качания, рад/с (не от FPS) */
  swayPhaseRadPerSec: number;
  /** Горизонталь при |cos|=1, пикс/с */
  swayPixelsPerSec: number;
  /** Макс. крен ±N° (рад): по часовой / против при качании */
  maxBankRad: number;
  /** Скорость падения, пикс/с */
  fallSpeedPps: number;
  sizeMul: number;
  baseOpacity: number;
}

const BASE_HEIGHT_PX = 9;
const DEG = Math.PI / 180;
/** Было «за кадр» при ~60 FPS — переводим в /сек для стабильной скорости на 120 Hz и т.д. */
const ASSUMED_FPS = 60;

/** У исходного PNG белый прямоугольник без альфы — делаем светлые «плоские» пиксели прозрачными. Лучше заменить файл на PNG с альфа-каналом. */
function canvasWithoutFlatWhiteBackdrop(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cctx = c.getContext('2d');
  if (!cctx) return c;
  cctx.drawImage(img, 0, 0);
  const { data } = cctx.getImageData(0, 0, w, h);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    // однотонные светлые (белый фон и сглаживание на нём), не трогаем насыщенный розовый лепесток
    if (lo > 244 && hi - lo < 18) data[i + 3] = 0;
  }
  cctx.putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

export function SpringPetals() {
  const { effectsEnabled } = useEffects();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const petalsRef = useRef<Petal[]>([]);

  useEffect(() => {
    if (!effectsEnabled) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    let started = false;

    const img = new Image();
    img.src = sakuraPetalUrl;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const area = canvas.width * canvas.height;
      const count = Math.floor(area / 26000);
      petalsRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseTilt: (Math.random() - 0.5) * 0.08,
        swayPhase: Math.random() * Math.PI * 2,
        swayPhaseRadPerSec: (0.011 + Math.random() * 0.016) * ASSUMED_FPS,
        swayPixelsPerSec: (0.32 + Math.random() * 0.38) * ASSUMED_FPS,
        maxBankRad: (18 + Math.random() * 14) * DEG,
        fallSpeedPps: (0.18 + Math.random() * 0.12) * ASSUMED_FPS,
        sizeMul: 0.55 + Math.random() * 0.42,
        baseOpacity: 0.42 + Math.random() * 0.38,
      }));
    };

    const tryStart = () => {
      if (cancelled || started || !img.naturalWidth) return;
      started = true;

      const petalRaster = canvasWithoutFlatWhiteBackdrop(img);

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      let lastT: number | null = null;
      const animate = (t: number) => {
        if (cancelled) return;
        if (lastT === null) lastT = t;
        const dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;

        const themeMultiplier = themeRef.current === 'dark' ? 0.55 : 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const nh = petalRaster.height;
        const nw = petalRaster.width;

        petalsRef.current.forEach((p) => {
          p.swayPhase += p.swayPhaseRadPerSec * dt;
          const sway = Math.cos(p.swayPhase);
          // влево-вправо и крен синхронно: вправо (+x) → по часовой (положительный rotate в canvas)
          p.x += sway * p.swayPixelsPerSec * dt;
          p.y += p.fallSpeedPps * dt;

          const h = BASE_HEIGHT_PX * p.sizeMul;
          const w = (nw / nh) * h;
          const margin = Math.max(w, h) + 8;

          if (p.y > canvas.height + margin) {
            p.y = -margin;
            p.x = Math.random() * canvas.width;
            p.swayPhase = Math.random() * Math.PI * 2;
          }
          if (p.x < -margin) p.x = canvas.width + margin;
          else if (p.x > canvas.width + margin) p.x = -margin;

          const rot = p.baseTilt + sway * p.maxBankRad;

          const alpha = p.baseOpacity * themeMultiplier;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(rot);
          ctx.globalAlpha = alpha;
          ctx.drawImage(petalRaster, -w / 2, -h / 2, w, h);
          ctx.restore();
        });

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    img.onload = tryStart;
    if (img.complete) tryStart();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [effectsEnabled]);

  if (!effectsEnabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 pointer-events-none"
      style={{ zIndex: 9998 }}
    />
  );
}
