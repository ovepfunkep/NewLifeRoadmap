import { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
  position?: 'left' | 'right' | 'top' | 'bottom';
}

export function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  // На мобильных устройствах для позиции 'right' показываем справа, на десктопе - сверху
  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2 md:left-1/2 md:ml-0 md:bottom-full md:mb-2 md:transform md:-translate-x-1/2 md:top-auto',
  };

  const arrowClasses = {
    top: 'absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700',
    bottom: 'absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900 dark:border-b-gray-700',
    left: 'absolute left-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-l-gray-900 dark:border-l-gray-700',
    right: 'absolute right-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-700 md:right-auto md:top-full md:left-1/2 md:transform md:-translate-x-1/2 md:border-r-transparent md:border-t-gray-900 dark:md:border-t-gray-700',
  };

  return (
    <div className="relative group">
      {children}
      <div className={`absolute ${positionClasses[position]} px-2 py-1 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50`}>
        {text}
        <div className={arrowClasses[position]} />
      </div>
    </div>
  );
}

