// Десктоп Chromium: клик по `opacity:0` date/time часто не открывает picker; showPicker из жеста мыши работает.
// На реальном iOS touch должен попадать в нативный `<input>` без showPicker — WebKit там vendor Apple.
// В Chrome DevTools при эмуляции iPhone: pointerType = touch и vendor всё ещё Google — иначе pickers не открываются.
function isLikelyChromeDevtoolsIosTouchEmulation(nav: Navigator): boolean {
  const ua = nav.userAgent || '';
  const vendor = nav.vendor || '';
  if (/Android/i.test(ua)) return false;
  if (!/(iPhone|iPad|iPod)/i.test(ua)) return false;
  // Реальный Mobile Safari/Chromium под iOS публикует Apple в vendor.
  return vendor.includes('Google');
}

export function openNativeDateTimePickerFromOverlay(
  overlayEl: HTMLElement,
  e: { pointerType: string; preventDefault: () => void; stopPropagation: () => void },
): void {
  const input = overlayEl.querySelector('input');
  if (!(input instanceof HTMLInputElement)) return;

  const pointer = e.pointerType;
  const isMousePen = pointer === 'mouse' || pointer === 'pen';
  const isDevtoolsTouchIos =
    !isMousePen &&
    typeof navigator !== 'undefined' &&
    isLikelyChromeDevtoolsIosTouchEmulation(navigator);

  if (!isMousePen && !isDevtoolsTouchIos) return;
  if (typeof input.showPicker !== 'function') return;

  try {
    void input.showPicker();
    e.preventDefault();
    e.stopPropagation();
  } catch {
    // Не блокируем нативный клик по input (Firefox и т.д.)
  }
}
