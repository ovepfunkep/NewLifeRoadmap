import { useState, useEffect, useRef } from 'react';
import { Node, ImportStrategy } from '../types';
import { t } from '../i18n';
import { bulkImport } from '../db';

interface ImportExportModalProps {
  currentNode: Node;
  onImport: () => void;
  onClose: () => void;
}

export function ImportExportModal({ currentNode, onImport, onClose }: ImportExportModalProps) {
  const [strategy, setStrategy] = useState<ImportStrategy>('add');
  const [importing, setImporting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);

  // Обработка ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      target: e.target,
      inside: modalRef.current?.contains(e.target as unknown as globalThis.Node) || false
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (clickStartRef.current && !clickStartRef.current.inside) {
      const endedInside = modalRef.current?.contains(e.target as unknown as globalThis.Node) || false;
      if (!endedInside) {
        onClose();
      }
    }
    clickStartRef.current = null;
  };

  const handleExport = () => {
    const json = JSON.stringify(currentNode, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Форматируем дату и время: YYYY-MM-DD_HH-mm
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.getHours().toString().padStart(2, '0') + '-' + 
                    now.getMinutes().toString().padStart(2, '0');
    
    const safeTitle = currentNode.title.replace(/[^a-zа-я0-9]/gi, '_');
    a.download = `${safeTitle}_${dateStr}_${timeStr}.json`;
    
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const node: Node = JSON.parse(text);
      
      await bulkImport(currentNode.id, node, strategy);
      
      onImport();
      onClose();
    } catch (error) {
      alert(t('toast.importError'));
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          {t('importExport.importTitle')} / {t('importExport.exportTitle')}
        </h2>
        
        <div className="space-y-4">
          {/* Экспорт */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('importExport.export')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t('importExport.exportHint')}
            </p>
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 text-sm rounded-lg text-white transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('importExport.export')}
            </button>
          </div>
          
          <hr className="border-gray-200 dark:border-gray-700" />
          
          {/* Импорт */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('importExport.import')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t('importExport.importHint')}
            </p>
            
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={strategy === 'add'}
                  onChange={() => setStrategy('add')}
                  className="text-accent"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('importExport.strategyAdd')}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={strategy === 'replace'}
                  onChange={() => setStrategy('replace')}
                  className="text-accent"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('importExport.strategyReplace')}
                </span>
              </label>
            </div>
            
            <label className="block">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
              <div
                className={`w-full px-4 py-2 text-sm rounded-lg text-white text-center transition-colors cursor-pointer ${
                  importing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {importing ? t('general.loading') : t('importExport.selectFile')}
              </div>
            </label>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('general.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

