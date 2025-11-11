import { useState, useEffect, useRef } from 'react';
import { Node } from '../types';
import { SyncDiff, compareNodes } from '../utils/syncCompare';

interface SyncConflictDialogProps {
  localNodes: Node[];
  cloudNodes: Node[];
  onChooseLocal: () => void;
  onChooseCloud: () => void;
  onCancel: () => void;
}

interface TreeNodeProps {
  node: Node;
  level: number;
  diff: SyncDiff;
  source: 'local' | 'cloud';
}

function TreeNode({ node, level, diff, source }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);

  const isLocalOnly = diff.localOnly.some(n => n.id === node.id);
  const isCloudOnly = diff.cloudOnly.some(n => n.id === node.id);
  const isDifferent = diff.different.find(d => d.nodeId === node.id);

  let badge = null;
  if (isLocalOnly && source === 'local') {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">Только локально</span>;
  } else if (isCloudOnly && source === 'cloud') {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">Только в облаке</span>;
  } else if (isDifferent && source === 'local') {
    badge = <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300">Изменён</span>;
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button
          className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
        >
          {node.children.length > 0 ? (isExpanded ? '−' : '+') : <span className="w-4" />}
        </button>
        <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
          {node.title}
        </span>
        {badge}
        {isDifferent && source === 'local' && (
          <span className="text-xs text-gray-500 dark:text-gray-400" title={isDifferent.differences.join(', ')}>
            ({isDifferent.differences.length} изменений)
          </span>
        )}
      </div>
      {isExpanded && node.children.length > 0 && (
        <div className="ml-5 border-l border-gray-200 dark:border-gray-700">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              diff={diff}
              source={source}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SyncConflictDialog({
  localNodes,
  cloudNodes,
  onChooseLocal,
  onChooseCloud,
  onCancel,
}: SyncConflictDialogProps) {
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [localRoot, setLocalRoot] = useState<Node | null>(null);
  const [cloudRoot, setCloudRoot] = useState<Node | null>(null);
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ target: EventTarget | null; inside: boolean } | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const calculateDiff = () => {
      const comparison = compareNodes(localNodes, cloudNodes);
      setDiff(comparison);

      // Находим корневые узлы
      const localRootNode = localNodes.find(n => !n.parentId || n.id === 'root-node') || null;
      const cloudRootNode = cloudNodes.find(n => !n.parentId || n.id === 'root-node') || null;
      
      setLocalRoot(localRootNode);
      setCloudRoot(cloudRootNode);
    };

    calculateDiff();
  }, [localNodes, cloudNodes]);

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
        onCancel();
      }
    }
    clickStartRef.current = null;
  };

  // Обработка свайпа для мобильных устройств
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    
    const diffX = touchStartX - touchEndX;
    const minSwipeDistance = 50; // Минимальное расстояние для свайпа

    if (Math.abs(diffX) > minSwipeDistance) {
      if (diffX > 0 && activeTab === 'cloud') {
        // Свайп влево - переключаем на локальные данные
        setActiveTab('local');
      } else if (diffX < 0 && activeTab === 'local') {
        // Свайп вправо - переключаем на облачные данные
        setActiveTab('cloud');
      }
    }

    setTouchStartX(null);
    setTouchEndX(null);
  };

  if (!diff || !localRoot || !cloudRoot) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col mx-4">
          <div className="p-6">
            <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
          </div>
        </div>
      </div>
    );
  }

  const hasLocalOnly = diff.localOnly.length > 0;
  const hasCloudOnly = diff.cloudOnly.length > 0;
  const hasDifferent = diff.different.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Конфликт синхронизации
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Данные на сервере и локальные отличаются. Выберите, какие данные сохранить.
          </p>
          <div className="mt-4 flex gap-4 text-sm flex-wrap">
            {hasLocalOnly && (
              <span className="text-blue-600 dark:text-blue-400">
                Локально только: {diff.localOnly.length} узлов
              </span>
            )}
            {hasCloudOnly && (
              <span className="text-green-600 dark:text-green-400">
                В облаке только: {diff.cloudOnly.length} узлов
              </span>
            )}
            {hasDifferent && (
              <span className="text-yellow-600 dark:text-yellow-400">
                Изменено: {diff.different.length} узлов
              </span>
            )}
          </div>
        </div>

        {/* Табы для мобильных устройств */}
        {isMobile && (
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('local')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'local'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Локальные данные
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'cloud'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-b-2 border-green-600 dark:border-green-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Облачные данные
            </button>
          </div>
        )}

        <div className="flex-1 p-6 overflow-hidden flex flex-col min-h-0">
          {isMobile ? (
            // Мобильный вид: один таб за раз
            <div className="flex flex-col h-full min-h-0">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50 flex-1 overflow-y-auto min-h-0">
                {activeTab === 'local' && localRoot && (
                  <TreeNode node={localRoot} level={0} diff={diff} source="local" />
                )}
                {activeTab === 'cloud' && cloudRoot && (
                  <TreeNode node={cloudRoot} level={0} diff={diff} source="cloud" />
                )}
              </div>
            </div>
          ) : (
            // Десктопный вид: две колонки
            <div className="grid grid-cols-2 gap-6 h-full min-h-0">
              {/* Локальные данные */}
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex-shrink-0">
                  Локальные данные
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50 flex-1 overflow-y-auto min-h-0">
                  {localRoot && (
                    <TreeNode node={localRoot} level={0} diff={diff} source="local" />
                  )}
                </div>
              </div>

              {/* Облачные данные */}
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex-shrink-0">
                  Облачные данные
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50 flex-1 overflow-y-auto min-h-0">
                  {cloudRoot && (
                    <TreeNode node={cloudRoot} level={0} diff={diff} source="cloud" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки внизу под соответствующими колонками */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          {isMobile ? (
            // Мобильный вид: одна кнопка действия
            <button
              onClick={activeTab === 'local' ? onChooseLocal : onChooseCloud}
              className={`w-full px-4 py-2 rounded-lg text-white transition-colors ${
                activeTab === 'local'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              Использовать {activeTab === 'local' ? 'локальные' : 'облачные'} данные
            </button>
          ) : (
            // Десктопный вид: две кнопки под соответствующими колонками
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col">
                <button
                  onClick={onChooseLocal}
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Использовать локальные данные
                </button>
              </div>
              <div className="flex flex-col">
                <button
                  onClick={onChooseCloud}
                  className="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  Использовать облачные данные
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
