/**
 * Единая шкала fixed-слоёв (снизу вверх по z-index).
 * Контент страницы в потоке — без явного z; ambient и модалки — fixed.
 *
 * Порядок: ambient (60) < sticky header (50 — класс tailwind) — см. ниже;
 * headerDecor (70) поверх ambient; settings FAB (85); modal (100); modalHigh (110); tooltip portal (120).
 *
 * Важно: sticky Header использует z-50 — ниже ambient (60), чтобы лепестки были над шапкой.
 */

/** Полноэкранный canvas: лепестки / снег */
export const Z_AMBIENT = 60;

/** Декор только в полосе шапки: гирлянда, деревья сакуры */
export const Z_HEADER_DECOR = 70;

/** FAB настроек и его палитра — над ambient, под модалками */
export const Z_SETTINGS = 85;

/** Нижняя мобильная навигация */
export const Z_MOBILE_NAV = 82;

/** Мобильная кнопка быстрого добавления */
export const Z_MOBILE_FAB = 84;

/** Тосты: поверх mobile nav/FAB, но под модалками */
export const Z_TOAST = 90;

/** Стандартный fullscreen overlay модалок */
export const Z_MODAL = 100;

/** Критичные / поверх базовой модалки (auth, конфликты по необходимости) */
export const Z_MODAL_HIGH = 110;

/** Подсказки (portal в body): над карточками, шапкой и модалками */
export const Z_TOOLTIP = 120;
