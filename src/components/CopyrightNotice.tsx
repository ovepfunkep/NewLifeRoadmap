/** Однострочный копирайт; год берётся в рантайме (обновляется при смене календарного года). */
export function CopyrightNotice({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <p className={`text-[10px] text-gray-500 dark:text-gray-400 ${className}`}>
      © {year} Тябин Иван Алексеевич
    </p>
  );
}
