import { useState, useMemo } from 'react';
import { Node } from '../types';
import { FiChevronLeft, FiChevronRight, FiRotateCw } from 'react-icons/fi';

interface CalendarViewProps {
  node: Node;
  deadlines: Node[];
  onNavigate: (id: string) => void;
  onDayClick: (date: Date, tasks: Node[]) => void;
  onCreateTask?: (date: Date) => void;
  compact?: boolean;
}

interface DayData {
  date: Date;
  tasks: Node[];
  isCurrentMonth: boolean;
}

// Получить название месяца и год
function getMonthYearLabel(date: Date, lang: string): string {
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' });
}

// Вспомогательная функция для получения ключа даты в локальном времени (YYYY-MM-DD)
function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Генерация массива дней для месяца с захватом соседних недель для полной сетки 7x5 или 7x6
function generateMonthDays(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  let firstDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon...
  // Корректировка для понедельника как первого дня недели (0 = Mon, ..., 6 = Sun)
  firstDayOfWeek = (firstDayOfWeek === 0 ? 7 : firstDayOfWeek) - 1;
  
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDayOfWeek);
  
  const days: Date[] = [];
  // Используем 42 дня (6 недель), чтобы гарантированно покрыть любой месяц
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }
  
  return days;
}

export function CalendarView({ deadlines, onDayClick, onCreateTask }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const lang = typeof window !== 'undefined' ? localStorage.getItem('language') || 'ru' : 'ru';
  const weekdays = lang === 'ru' 
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const days = useMemo(() => generateMonthDays(currentDate), [currentDate]);
  
  const tasksByDay = useMemo(() => {
    const map = new Map<string, DayData>();
    const currentMonth = currentDate.getMonth();
    
    days.forEach(day => {
      const key = getDateKey(day);
      map.set(key, {
        date: day,
        tasks: [],
        isCurrentMonth: day.getMonth() === currentMonth
      });
    });
    
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
  }, [deadlines, days, currentDate]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleReset = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setCurrentDate(t);
  };

  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка календаря с навигацией */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 capitalize">
          {getMonthYearLabel(currentDate, lang)}
        </h3>
        <div className="flex items-center gap-2">
          {!isCurrentMonth && (
            <button
              onClick={handleReset}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              style={{ color: 'var(--accent)' }}
              title="К сегодняшнему дню"
            >
              <FiRotateCw size={18} />
            </button>
          )}
          <button
            onClick={handlePreviousMonth}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <FiChevronLeft size={20} />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <FiChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Сетка календаря */}
      <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        {/* Заголовки дней недели */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          {weekdays.map(wd => (
            <div key={wd} className="py-2 text-center text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {wd}
            </div>
          ))}
        </div>

        {/* Дни */}
        <div className="grid grid-cols-7 bg-white dark:bg-gray-800">
          {days.map((day, idx) => {
            const key = getDateKey(day);
            const dayData = tasksByDay.get(key)!;
            const isToday = day.getTime() === today.getTime();
            const hasTasks = dayData.tasks.length > 0;
            const displayTasks = dayData.tasks.slice(0, 3);
            const moreTasks = dayData.tasks.length > 3 ? dayData.tasks.length - 2 : 0;
            
            // Если больше 3 задач, показываем 2 рисинки и счетчик
            const finalDisplayTasks = moreTasks > 0 ? dayData.tasks.slice(0, 2) : displayTasks;

            return (
              <div
                key={key}
                className={`
                  relative min-h-[60px] sm:min-h-[80px] border-r border-b border-gray-100 dark:border-gray-700/50 last:border-r-0
                  ${!dayData.isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-900/20 grayscale opacity-40' : ''}
                  ${idx % 7 === 6 ? 'border-r-0' : ''}
                `}
              >
                <button
                  onClick={() => hasTasks ? onDayClick(day, dayData.tasks) : onCreateTask?.(day)}
                  className={`
                    w-full h-full p-0.5 sm:p-1 flex flex-col items-start gap-0.5 transition-all
                    ${hasTasks || onCreateTask ? 'hover:bg-accent/5 dark:hover:bg-accent/10 cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <span className={`
                    text-[10px] sm:text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center
                    ${isToday ? 'bg-accent text-white' : 'text-gray-700 dark:text-gray-300'}
                  `} style={isToday ? { backgroundColor: 'var(--accent)' } : {}}>
                    {day.getDate()}
                  </span>

                  <div className="flex flex-col gap-0.5 w-full mt-0">
                    {finalDisplayTasks.map(task => (
                      <div
                        key={task.id}
                        className="h-1 sm:h-1.5 w-full rounded-full opacity-80"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    ))}
                    {moreTasks > 0 && (
                      <div className="h-2.5 sm:h-3 w-full rounded flex items-center justify-center text-[6px] sm:text-[8px] font-normal bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        +{moreTasks}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
