import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Node } from '../types';
import { FiChevronLeft, FiChevronRight, FiRotateCw, FiPlus, FiMinus } from 'react-icons/fi';
import { Tooltip } from './Tooltip';

interface CalendarViewProps {
  node: Node;
  deadlines: Node[];
  onNavigate: (id: string) => void;
  onDayClick: (date: Date, tasks: Node[]) => void;
  onCreateTask?: (date: Date) => void; // Обработчик создания задачи с датой
  compact?: boolean;
}

type RangeSize = 'week' | 'month';

interface DayData {
  date: Date;
  tasks: Node[];
}

// Получить название месяца
function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('ru-RU', { month: 'long' });
}

// Генерация массива дней для диапазона
function generateDays(startDate: Date, rangeSize: RangeSize, isMobile: boolean = false, daysRange?: { start: number; end: number }): Date[] {
  const days: Date[] = [];
  
  if (isMobile && daysRange) {
    // На мобильных генерируем только видимый диапазон дней
    for (let i = daysRange.start; i <= daysRange.end; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
  } else if (isMobile) {
    // Изначально показываем только неделю с сегодняшним днем
    // 3 дня назад, сегодня, 3 дня вперед
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }
  } else {
    // На десктопе используем стандартную логику
    const count = rangeSize === 'week' ? 7 : 30;
    for (let i = 0; i < count; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
  }
  
  return days;
}

// Вспомогательная функция для получения ключа даты в локальном времени (YYYY-MM-DD)
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Группировка задач по дням
function groupTasksByDay(deadlines: Node[], days: Date[]): Map<string, DayData> {
  const map = new Map<string, DayData>();
  
  // Инициализируем все дни
  days.forEach(day => {
    const key = getDateKey(day);
    map.set(key, {
      date: day,
      tasks: []
    });
  });
  
  // Распределяем задачи по дням
  deadlines.forEach(task => {
    if (!task.deadline) return;
    
    const taskDate = new Date(task.deadline);
    const taskKey = getDateKey(taskDate);
    
    const dayData = map.get(taskKey);
    if (dayData) {
      dayData.tasks.push(task);
    }
  });
  
  return map;
}

// Форматирование даты для отображения
function formatDay(date: Date): { day: number; weekday: string } {
  const day = date.getDate();
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
  return { day, weekday };
}

export function CalendarView({ node: _node, deadlines, onNavigate: _onNavigate, onDayClick, onCreateTask, compact = false }: CalendarViewProps) {
  const [rangeSize, setRangeSize] = useState<RangeSize>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('calendarRangeSize');
      return (stored === 'week' || stored === 'month') ? stored : 'week';
    }
    return 'week';
  });
  
  useEffect(() => {
    localStorage.setItem('calendarRangeSize', rangeSize);
  }, [rangeSize]);
  const [startDate, setStartDate] = useState<Date>(() => {
    // Начальная дата - сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Отслеживаем размер экрана для правильного применения gridTemplateColumns
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  // Диапазон дней для мобильных устройств (для бесконечной прокрутки)
  const [daysRange, setDaysRange] = useState<{ start: number; end: number } | undefined>(() => {
    if (!(compact || (typeof window !== 'undefined' && window.innerWidth >= 1024))) {
      // Изначально показываем 4 недели: 14 дней назад, сегодня, 14 дней вперед
      return { start: -14, end: 14 };
    }
    return undefined;
  });

  const days = useMemo(() => generateDays(startDate, rangeSize, !(compact || isLargeScreen), daysRange), [startDate, rangeSize, compact, isLargeScreen, daysRange]);
  const tasksByDay = useMemo(() => groupTasksByDay(deadlines, days), [deadlines, days]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const showResetButton = startDate.toDateString() !== today.toDateString();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkScreenSize = () => {
      const isLarge = window.innerWidth >= 1024;
      setIsLargeScreen(isLarge);
      // Обновляем daysRange при изменении размера экрана
      if (!(compact || isLarge)) {
        setDaysRange({ start: -14, end: 14 });
      } else {
        setDaysRange(undefined);
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [compact]);

  // Обработчик прокрутки для динамической загрузки дней на мобильных
  useEffect(() => {
    if (!calendarRef.current || (compact || isLargeScreen) || !daysRange) return;

    let timeoutId: NodeJS.Timeout | null = null;

    // Находим родительский контейнер со скроллом
    let scrollContainer: HTMLElement | null = calendarRef.current.parentElement;
    while (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement) {
      const style = window.getComputedStyle(scrollContainer);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || scrollContainer.classList.contains('overflow-y-auto')) {
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    }
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement) {
      scrollContainer = null;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const dayDate = element.getAttribute('data-day-date');
          
          if (entry.isIntersecting) {

            if (timeoutId) clearTimeout(timeoutId);
            
            timeoutId = setTimeout(() => {
              if (!dayDate || isLoadingRef.current) return;

              const dayIndex = days.findIndex(d => getDateKey(d) === dayDate);
              if (dayIndex === -1) return;

              const rect = element.getBoundingClientRect();
              const containerRect = scrollContainer 
                ? scrollContainer.getBoundingClientRect() 
                : { top: 0, bottom: window.innerHeight, height: window.innerHeight };
              
              const elementTopRelative = rect.top - containerRect.top;
              const elementBottomRelative = rect.bottom - containerRect.top;
              const viewportHeight = containerRect.height;
              
              const isVisible = elementBottomRelative > 0 && elementTopRelative < viewportHeight;
              if (!isVisible) return;

              const SENTINEL_COUNT = 7;
              const isNearTopEdge = dayIndex < SENTINEL_COUNT;
              const isNearBottomEdge = dayIndex >= days.length - SENTINEL_COUNT;
              
              if (isNearTopEdge && daysRange.start > -365 * 2) {
                const isNearTop = elementTopRelative < viewportHeight * 0.5; 
                const currentFirstDayKey = getDateKey(days[0]);
                
                if (isNearTop && currentFirstDayKey !== lastLoadedFirstDayKeyRef.current && !isLoadingRef.current) {

                  isLoadingRef.current = true;
                  lastLoadedFirstDayKeyRef.current = currentFirstDayKey;
                  
                  if (scrollContainer && calendarRef.current) {
                    const anchorRect = element.getBoundingClientRect();
                    const containerRectBefore = scrollContainer.getBoundingClientRect();
                    referenceElementKeyRef.current = dayDate;
                    referenceElementPositionRef.current = {
                      top: anchorRect.top - containerRectBefore.top,
                      scrollTop: scrollContainer.scrollTop
                    };
                  }
                  
                  setDaysRange(prev => prev ? { start: prev.start - 14, end: prev.end } : undefined);
                }
              }
              if (isNearBottomEdge && daysRange.end < 365 * 2) {
                const isNearBottom = elementBottomRelative > viewportHeight * 0.5;
                const currentLastDayKey = getDateKey(days[days.length - 1]);
                
                if (isNearBottom && currentLastDayKey !== lastLoadedLastDayKeyRef.current && !isLoadingRef.current) {

                  isLoadingRef.current = true;
                  lastLoadedLastDayKeyRef.current = currentLastDayKey;
                  setDaysRange(prev => prev ? { start: prev.start, end: prev.end + 14 } : undefined);
                }
              }
            }, 50);
          }
        });
      },
      { 
        root: scrollContainer,
        rootMargin: '400px', // Увеличил margin до 400px для еще более ранней загрузки
        threshold: [0, 0.25, 0.5, 0.75, 1] 
      }
    );

    // Наблюдаем за группой элементов в начале и в конце списка (первые и последние 7 дней)
    // Это гарантирует, что мы не пропустим точку срабатывания при быстром скролле
    const dayElements = calendarRef.current.querySelectorAll('[data-day-date]');
    const SENTINEL_COUNT = 7;
    
    if (dayElements.length > 0) {
      // Наблюдаем за первыми 7 элементами
      for (let i = 0; i < Math.min(SENTINEL_COUNT, dayElements.length); i++) {
        observer.observe(dayElements[i]);
      }
      // Наблюдаем за последними 7 элементами
      for (let i = Math.max(0, dayElements.length - SENTINEL_COUNT); i < dayElements.length; i++) {
        observer.observe(dayElements[i]);
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [days, daysRange, compact, isLargeScreen]);

  // Ref для календаря для плавной прокрутки
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledToTodayRef = useRef(false);
  const lastLoadedFirstDayKeyRef = useRef<string | null>(null); // Отслеживаем последний загруженный первый день
  const lastLoadedLastDayKeyRef = useRef<string | null>(null); // Отслеживаем последний загруженный последний день
  const isLoadingRef = useRef(false); // Флаг для предотвращения одновременных загрузок
  const previousDaysRangeStartRef = useRef<number | undefined>(undefined); // Отслеживаем предыдущее значение daysRange.start для обнаружения prepend
  const previousDaysRangeEndRef = useRef<number | undefined>(undefined); // Отслеживаем предыдущее значение daysRange.end
  const referenceElementKeyRef = useRef<string | null>(null); // Ключ элемента-якоря для восстановления позиции
  const referenceElementPositionRef = useRef<{ top: number; scrollTop: number } | null>(null); // Позиция элемента-якоря перед обновлением

  const handlePrevious = () => {
    const newStartDate = new Date(startDate);
    const offset = rangeSize === 'week' ? -7 : -30;
    newStartDate.setDate(startDate.getDate() + offset);
    setStartDate(newStartDate);
    
    // Плавная прокрутка к началу календаря на мобильных устройствах
    if (calendarRef.current && !(compact || isLargeScreen)) {
      setTimeout(() => {
        calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleNext = () => {
    const newStartDate = new Date(startDate);
    const offset = rangeSize === 'week' ? 7 : 30;
    newStartDate.setDate(startDate.getDate() + offset);
    setStartDate(newStartDate);
    
    // Плавная прокрутка к началу календаря на мобильных устройствах
    if (calendarRef.current && !(compact || isLargeScreen)) {
      setTimeout(() => {
        calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  // Функция для прокрутки элемента относительно контейнера календаря
  const scrollElementIntoView = (element: HTMLElement, block: ScrollLogicalPosition = 'center') => {
    if (!calendarRef.current) return;
    
    // Находим родительский контейнер со скроллом
    let scrollContainer: HTMLElement | null = calendarRef.current.parentElement;
    while (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement) {
      const style = window.getComputedStyle(scrollContainer);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || scrollContainer.classList.contains('overflow-y-auto')) {
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    }
    
    if (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement) {
      // Прокручиваем относительно контейнера
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollTop = scrollContainer.scrollTop;
      const elementTop = elementRect.top - containerRect.top + scrollTop;
      
      scrollContainer.scrollTo({
        top: block === 'center' ? elementTop - (containerRect.height / 2) + (elementRect.height / 2) : elementTop,
        behavior: 'smooth'
      });
    } else {
      // Если контейнер не найден, используем стандартный scrollIntoView
      element.scrollIntoView({ behavior: 'smooth', block });
    }
  };

  const handleReset = () => {
    setStartDate(today);
    
    // Сбрасываем диапазон дней на мобильных устройствах
    if (!(compact || isLargeScreen)) {
      setDaysRange({ start: -14, end: 14 });
      hasScrolledToTodayRef.current = false; // Сбрасываем флаг для повторной прокрутки
      
      // Сбрасываем refs для бесконечной прокрутки
      lastLoadedFirstDayKeyRef.current = null;
      lastLoadedLastDayKeyRef.current = null;
      isLoadingRef.current = false;
      referenceElementKeyRef.current = null;
      referenceElementPositionRef.current = null;
      previousDaysRangeStartRef.current = undefined;
    }
    
    // Прокрутка к текущей дате на мобильных устройствах
    if (calendarRef.current && !(compact || isLargeScreen)) {
      setTimeout(() => {
        // Находим элемент с текущей датой
        const todayElement = calendarRef.current?.querySelector(`[data-day-date="${getDateKey(today)}"]`) as HTMLElement;
        if (todayElement) {
          hasScrolledToTodayRef.current = true;
          scrollElementIntoView(todayElement, 'center');
        } else {
          // Если элемент не найден, прокручиваем к началу календаря
          if (calendarRef.current) {
            scrollElementIntoView(calendarRef.current, 'start');
          }
        }
      }, 200);
    }
  };

  // Невидимая коррекция скролла при добавлении дней сверху (prepend)
  // Используем useLayoutEffect для синхронной коррекции ДО отрисовки браузером
  useLayoutEffect(() => {
    if (!calendarRef.current || (compact || isLargeScreen) || !daysRange || days.length === 0) {
      previousDaysRangeStartRef.current = daysRange?.start;
      return;
    }

    // Находим родительский контейнер со скроллом
    let scrollContainer: HTMLElement | null = calendarRef.current.parentElement;
    while (scrollContainer && scrollContainer !== document.body && scrollContainer !== document.documentElement) {
      const style = window.getComputedStyle(scrollContainer);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll' || scrollContainer.classList.contains('overflow-y-auto')) {
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    }
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement) {
      scrollContainer = null;
    }
    if (!scrollContainer) {
      previousDaysRangeStartRef.current = daysRange.start;
      return;
    }

    const previousStart = previousDaysRangeStartRef.current;
    const currentStart = daysRange.start;

    if (previousStart !== undefined && (currentStart !== previousStart || daysRange.end !== previousDaysRangeEndRef.current)) {
      // Сбрасываем флаг загрузки ПОСЛЕ завершения коррекции скролла (или после рендера если коррекция не нужна)
      isLoadingRef.current = false;

      const isPrepend = currentStart < previousStart;
      

      if (isPrepend) {
        const referenceKey = referenceElementKeyRef.current;
        const savedPosition = referenceElementPositionRef.current;
        
        if (referenceKey && savedPosition) {
          const referenceElement = calendarRef.current.querySelector(`[data-day-date="${referenceKey}"]`) as HTMLElement;
          if (referenceElement) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = referenceElement.getBoundingClientRect();
            const newElementTopRelative = elementRect.top - containerRect.top;
            const elementOffset = newElementTopRelative - savedPosition.top;
            

            scrollContainer.scrollTop = savedPosition.scrollTop + elementOffset;
            referenceElementPositionRef.current = null;
          }
        }
      }
    }

    previousDaysRangeStartRef.current = currentStart;
    previousDaysRangeEndRef.current = daysRange.end;
  }, [days, daysRange, compact, isLargeScreen]);

  // Прокрутка к сегодняшнему дню при первой загрузке на мобильных
  // НЕ срабатывает при загрузке дней назад/вперед (только при первой инициализации)
  useEffect(() => {
    if (!calendarRef.current || (compact || isLargeScreen) || !daysRange || hasScrolledToTodayRef.current) return;
    
    // Прокручиваем к сегодня только если daysRange соответствует начальному состоянию (не было загрузки)
    // Это предотвращает прокрутку после загрузки дней назад/вперед
    const isInitialRange = daysRange.start === -14 && daysRange.end === 14;
    if (!isInitialRange) return;
    
    const todayElement = calendarRef.current.querySelector(`[data-day-date="${getDateKey(today)}"]`) as HTMLElement;
    if (todayElement) {
      hasScrolledToTodayRef.current = true;
      setTimeout(() => {
        scrollElementIntoView(todayElement, 'center');
      }, 100);
    }
  }, [daysRange, compact, isLargeScreen, today]);

  const handleDayClick = (dayData: DayData) => {
    if (dayData.tasks.length > 0) {
      onDayClick(dayData.date, dayData.tasks);
    } else if (onCreateTask) {
      // Если задач нет и есть обработчик создания, открываем создание задачи
      onCreateTask(dayData.date);
    }
  };

  const isToday = (date: Date): boolean => {
    return date.toDateString() === today.toDateString();
  };

  // Создание структуры с чередующимися строками: название месяца -> дни недели
  type CalendarRow = 
    | { type: 'month'; month: string; columnStart: number; rowIndex: number }
    | { type: 'days'; days: Date[]; weekIndex: number; rowIndex: number };
  
  const calendarRows = useMemo(() => {
    const rows: CalendarRow[] = [];
    const weeks: Date[][] = [];
    
    // Разбиваем дни на недели (по 7 дней)
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    let rowIndex = 1; // Начинаем с 1, так как grid-row начинается с 1
    
    weeks.forEach((weekDays, weekIndex) => {
      // Проверяем, начинается ли новый месяц в этой неделе
      const lastDayOfPreviousWeek = weekIndex > 0 ? weeks[weekIndex - 1][weeks[weekIndex - 1].length - 1] : null;
      
      // Находим первый день нового месяца в этой неделе
      let firstDayOfMonthIndex = -1;
      let monthLabel = '';
      
      if (lastDayOfPreviousWeek) {
        for (let i = 0; i < weekDays.length; i++) {
          const day = weekDays[i];
          const prevDay = i === 0 ? lastDayOfPreviousWeek : weekDays[i - 1];
          
          if (getMonthLabel(day) !== getMonthLabel(prevDay)) {
            firstDayOfMonthIndex = i;
            monthLabel = getMonthLabel(day);
            break;
          }
        }
      } else if (weekIndex === 0) {
        // Первая неделя - всегда показываем название месяца над первым днем
        firstDayOfMonthIndex = 0;
        monthLabel = getMonthLabel(weekDays[0]);
      }
      
      if (firstDayOfMonthIndex >= 0) {
        // Новый месяц начинается в этой неделе
        rows.push({
          type: 'month',
          month: monthLabel,
          columnStart: firstDayOfMonthIndex + 1,
          rowIndex: rowIndex++
        });
      }
      
      // Добавляем строку с днями
      rows.push({
        type: 'days',
        days: weekDays,
        weekIndex,
        rowIndex: rowIndex++
      });
    });
    
    return rows;
  }, [days]);

  // Callback ref для установки ref
  const setCalendarRef = useCallback((el: HTMLDivElement | null) => {
    calendarRef.current = el;
  }, []);


  return (
    <div className="space-y-4">
      {/* Кнопка "Сброс" на мобильных устройствах - закреплена сверху */}
      {!(compact || isLargeScreen) && (
        <div className="sticky top-0 z-20 flex justify-center mb-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors touch-manipulation shadow-md flex items-center gap-2"
            aria-label="Вернуться к сегодня"
            style={{
              color: 'var(--accent)'
            }}
          >
            <FiRotateCw className="w-4 h-4" />
            <span className="text-sm font-medium">Сброс</span>
          </button>
        </div>
      )}
      
      {/* Навигация - только на больших экранах */}
      {(compact || isLargeScreen) && (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevious}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors touch-manipulation"
            aria-label="Предыдущий период"
            style={{
              color: 'var(--accent)'
            }}
          >
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors touch-manipulation"
            aria-label="Следующий период"
            style={{
              color: 'var(--accent)'
            }}
          >
            <FiChevronRight className="w-5 h-5" />
          </button>
          {showResetButton && (
            <Tooltip text="Вернуться к сегодня">
              <button
                onClick={handleReset}
                className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors touch-manipulation"
                aria-label="Вернуться к сегодня"
                style={{
                  color: 'var(--accent)'
                }}
              >
                <FiRotateCw className="w-5 h-5" />
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Календарь - один грид с чередующимися строками */}
      <div 
        className={`grid ${compact ? 'gap-1' : ''} ${rangeSize === 'month' ? 'gap-x-3 gap-y-3' : 'gap-x-2 gap-y-2'}`}
        style={{
          rowGap: rangeSize === 'month' ? '12px' : '8px', // Общее расстояние между строками
          gridTemplateColumns: (compact || isLargeScreen) ? 'repeat(7, 1fr)' : '1fr' // Явно указываем равномерное распределение: 7 колонок на больших экранах, 1 колонка на мобильных
        }}
        ref={setCalendarRef}
      >
        {calendarRows.flatMap((row) => {
          if (row.type === 'month') {
            // Строка с названием месяца - скрываем на адаптиве
            if (!(compact || isLargeScreen)) {
              return null; // Не показываем названия месяцев на мобильных
            }
            return (
              <div
                key={`month-${row.rowIndex}`}
                className="h-6 flex items-start"
                style={{
                  gridColumn: `${row.columnStart} / span ${Math.min(7 - (row.columnStart - 1), 7)}`,
                  gridRow: row.rowIndex,
                  marginBottom: rangeSize === 'month' ? '-18px' : '-10px' // Уменьшаем расстояние до следующей строки (ещё меньше)
                }}
              >
                <span className={`${compact ? 'text-[10px]' : 'text-xs sm:text-sm'} font-medium text-gray-500 dark:text-gray-400 capitalize`}>
                  {row.month}
                </span>
              </div>
            );
          } else {
            // Строка с днями недели - на мобильных каждый день в отдельной строке
            return row.days.map((day) => {
              const key = getDateKey(day);
              const dayData = tasksByDay.get(key);
              const { day: dayNum, weekday } = formatDay(day);
              const isTodayDay = isToday(day);
              const hasTasks = dayData && dayData.tasks.length > 0;
              
              // Находим глобальный индекс дня в массиве days
              const dayGlobalIndex = days.findIndex(d => getDateKey(d) === key);
              const isFirstDayOfMonth = dayGlobalIndex === 0 || (dayGlobalIndex > 0 && days[dayGlobalIndex - 1]?.getMonth() !== day.getMonth());
              const showMonthDivider = isFirstDayOfMonth && dayGlobalIndex > 0 && rangeSize === 'month' && (compact || isLargeScreen);
              
              // Находим строку с месяцем перед текущей строкой дней
              const monthRowBefore = calendarRows.find(r => r.type === 'month' && r.rowIndex < row.rowIndex && r.rowIndex === row.rowIndex - 1);
              const hasMonthRowBefore = !!monthRowBefore;

              // Вычисляем индекс строки: на мобильных каждый день в отдельной строке
              // Нужно учесть все предыдущие строки месяцев и дни предыдущих недель
              let dayRowIndex = row.rowIndex;
              if (!(compact || isLargeScreen)) {
                // На мобильных: считаем все предыдущие строки месяцев и дни до текущего дня
                // Но так как мы скрыли месяцы на мобильных, считаем только дни
                dayRowIndex = dayGlobalIndex + 1;
              }

              const dayButton = (
                <button
                  onClick={() => dayData && handleDayClick(dayData)}
                  disabled={!hasTasks && !onCreateTask}
                  data-day-date={key}
                  className={`
                    w-full rounded-lg border transition-all text-left
                    ${compact 
                      ? 'p-2 min-h-[60px]' 
                      : 'p-3 min-h-[88px] sm:min-h-[100px]'
                    }
                    ${isTodayDay 
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }
                    ${hasTasks || onCreateTask
                      ? 'hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-[0.98]' 
                      : 'opacity-50 cursor-default'
                    }
                  `}
                  style={{
                    boxShadow: (hasTasks || onCreateTask) ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                    minWidth: 0, // Позволяет кнопке сжиматься меньше минимального размера контента
                    overflow: 'hidden' // Предотвращает переполнение контента
                  }}
                  onMouseEnter={(e) => {
                    if (hasTasks || onCreateTask) {
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (hasTasks || onCreateTask) {
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                    }
                  }}
                >
                  <div className="flex flex-col gap-1 h-full">
                    {/* Название месяца на мобильных устройствах (если первый день месяца) */}
                    {!(compact || isLargeScreen) && isFirstDayOfMonth && (
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 capitalize mb-1">
                        {getMonthLabel(day)}
                      </div>
                    )}
                    {/* Дата и день недели в верху - дата сверху */}
                    <div className="flex flex-col">
                      <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold ${isTodayDay ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {dayNum}
                      </span>
                      <span className={`text-xs font-medium ${isTodayDay ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {weekday}
                      </span>
                    </div>
                    {/* Рисинки задач - вертикально, на всю ширину */}
                    {hasTasks && (
                      <div className="flex flex-col gap-1 mt-1 flex-1">
                        {dayData.tasks.slice(0, compact ? 3 : 4).map((task) => {
                          const isPriority = task.priority;
                          const isMobile = !(compact || isLargeScreen);
                          return (
                            <div
                              key={task.id}
                              className={`w-full ${compact ? 'h-[8px]' : isMobile ? 'min-h-[24px] py-1 px-2' : 'h-[12px] sm:h-[10px]'} rounded ${isPriority ? 'ring-1 ring-offset-0' : ''} ${isMobile ? 'flex items-center' : ''}`}
                              style={{ 
                                backgroundColor: 'var(--accent)',
                                ...(isPriority && {
                                  boxShadow: `0 0 0 1px var(--accent)`
                                })
                              }}
                              title={task.title}
                            >
                              {isMobile && (
                                <span className="text-[10px] font-medium text-white truncate">
                                  {task.title}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {dayData.tasks.length > (compact ? 3 : 4) && (
                          <div className={`w-full ${compact ? 'h-[8px]' : !(compact || isLargeScreen) ? 'min-h-[24px] py-1 px-2' : 'h-[12px] sm:h-[10px]'} rounded flex items-center justify-center ${compact ? 'text-[8px]' : 'text-xs'} font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                            +{dayData.tasks.length - (compact ? 3 : 4)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );

              return (
                <div 
                  key={key} 
                  className="relative"
                  style={{ 
                    gridRow: dayRowIndex,
                    gridColumn: !(compact || isLargeScreen) ? '1 / -1' : undefined, // На мобильных занимаем всю ширину
                    minWidth: 0 // Позволяет элементу сжиматься меньше минимального размера контента
                  }}
                >
                  {showMonthDivider && (
                    <div 
                      className="absolute w-px bg-gray-300 dark:bg-gray-700 z-10"
                      style={{
                        left: rangeSize === 'month' ? '-6px' : '-4px', // Позиционируем точно между двумя колонками (половина gap)
                        top: hasMonthRowBefore ? `calc(-24px - ${rangeSize === 'month' ? '2px' : '2px'})` : '0', // Высота строки месяца (24px) + небольшое расстояние (2px)
                        bottom: '0',
                        height: hasMonthRowBefore ? `calc(100% + 24px + ${rangeSize === 'month' ? '2px' : '2px'})` : '100%' // Высота текущей строки + высота строки месяца + расстояние
                      }}
                    />
                  )}
                  {isLargeScreen && hasTasks ? (
                    <Tooltip
                      multiline
                      text={
                        <div className="flex flex-col gap-1.5 p-1 max-w-[250px]">
                          {dayData.tasks.map(task => {
                            const date = task.deadline ? new Date(task.deadline) : null;
                            const hasTime = date && (date.getHours() !== 0 || date.getMinutes() !== 0);
                            return (
                              <div key={task.id} className="flex items-center gap-2 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                                <span className="truncate flex-1">{task.title}</span>
                                {hasTime && (
                                  <span className="text-[10px] opacity-60 flex-shrink-0">
                                    {date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      }
                    >
                      {dayButton}
                    </Tooltip>
                  ) : (
                    dayButton
                  )}
                </div>
              );
            });
          }
        })}
      </div>


      {/* Кнопка раскрытия/сворачивания - только на больших экранах */}
      {(compact || isLargeScreen) && (
        <button
          onClick={() => setRangeSize(rangeSize === 'week' ? 'month' : 'week')}
          className="w-full py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-all touch-manipulation flex items-center justify-center gap-2"
          aria-label={rangeSize === 'week' ? 'Раскрыть до месяца' : 'Свернуть до недели'}
          style={{
            color: 'var(--accent)'
          }}
        >
          {rangeSize === 'week' ? (
            <>
              <FiPlus className="w-5 h-5" />
              <span className="text-sm font-medium">Раскрыть до месяца</span>
            </>
          ) : (
            <>
              <FiMinus className="w-5 h-5" />
              <span className="text-sm font-medium">Свернуть до недели</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

