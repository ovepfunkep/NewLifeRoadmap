import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import { FiChevronLeft, FiChevronRight, FiFolder, FiX } from 'react-icons/fi';
import { getNode } from '../db';
import { useTranslation } from '../i18n';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { useNodeNavigation } from '../hooks/useHashRoute';
import { Node } from '../types';
import {
  buildDashboardStats,
  dashboardPeriodLabel,
  dashboardWeekStartsInYear,
  DashboardPeriod,
  DashboardTreemapNode,
  shiftDashboardAnchor,
} from '../utils/dashboardStats';
import { DashboardNodePickerModal } from './DashboardNodePickerModal';
import { ConfirmDialog } from './ConfirmDialog';
import { MobileBottomSheet } from './MobileBottomSheet';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  chartHeightClassName?: string;
}

interface TreemapCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: DashboardTreemapNode;
  id?: string;
  name?: string;
  size?: number;
  minSize?: number;
  maxSize?: number;
}

interface TreemapNavigateTarget {
  id: string;
  name: string;
}

interface DashboardContentProps {
  initialNodeId: string;
  onClose?: () => void;
  className?: string;
  showCloseButton?: boolean;
  showNodePicker?: boolean;
  onSelectedNodeChange?: (nodeId: string) => void;
}

const CHART_COLORS = {
  strong: 'rgb(var(--accent-rgb))',
  medium: 'rgba(var(--accent-rgb), 0.9)',
  soft: 'rgba(var(--accent-rgb), 0.82)',
  faint: 'rgba(var(--accent-rgb), 0.74)',
  pale: 'rgba(var(--accent-rgb), 0.66)',
  whisper: 'rgba(var(--accent-rgb), 0.58)',
};
const PERIODS: DashboardPeriod[] = ['year', 'quarter', 'month', 'week'];
const GRID_STROKE = 'rgba(148,163,184,0.18)';
const PICKER_YEAR_PAD = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTreemapSize(size: number, minSize: number, maxSize: number): number {
  if (maxSize <= minSize) return 0.55;
  const raw = (size - minSize) / (maxSize - minSize);
  return Math.pow(clamp(raw, 0, 1), 0.72);
}

function treemapFill(size: number, minSize: number, maxSize: number): string {
  const intensity = normalizeTreemapSize(size, minSize, maxSize);
  const blackMix = Math.round(8 + intensity * 40);
  return `color-mix(in srgb, rgb(var(--accent-rgb)) ${100 - blackMix}%, black ${blackMix}%)`;
}

function wrapTreemapLabel(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  if (!text.trim()) return [];
  const safeCharsPerLine = Math.max(2, maxCharsPerLine);
  const safeMaxLines = Math.max(1, maxLines);
  const tokens = text
    .trim()
    .split(/\s+/)
    .flatMap((word) => {
      if (word.length <= safeCharsPerLine) return [word];
      return word.match(new RegExp(`.{1,${safeCharsPerLine - 1}}`, 'g')) ?? [word];
    });

  const lines: string[] = [];
  let index = 0;
  while (index < tokens.length && lines.length < safeMaxLines) {
    let line = tokens[index];
    index += 1;
    while (index < tokens.length) {
      const candidate = `${line} ${tokens[index]}`;
      if (candidate.length > safeCharsPerLine) break;
      line = candidate;
      index += 1;
    }
    lines.push(line);
  }

  if (index < tokens.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, safeCharsPerLine - 1)).trimEnd()}…`;
  }

  return lines;
}

function ChartCard({
  title,
  children,
  className = '',
  chartHeightClassName = 'h-56 sm:h-64',
}: ChartCardProps) {
  return (
    <section className={`rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-gray-800 lg:rounded-xl ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      <div className={`min-h-0 ${chartHeightClassName}`}>{children}</div>
    </section>
  );
}

function TreemapCell(props: TreemapCellProps) {
  const { x, y, width, height, payload } = props;
  const node = payload ?? {
    id: props.id || '',
    name: props.name || '',
    size: props.size || 0,
    kind: 'project' as const,
  };
  if (!node.name) return null;
  const px = x ?? 0;
  const py = y ?? 0;
  const w = width ?? 0;
  const h = height ?? 0;
  const minSize = props.minSize ?? 0;
  const maxSize = props.maxSize ?? 0;
  if (w <= 0 || h <= 0) return null;
  const size = typeof node.size === 'number' ? node.size : 0;
  const fill = treemapFill(size, minSize, maxSize);
  const canRenderLabel = w > 66 && h > 34;
  const canRenderValue = w > 52 && h > 34;
  const baseTextColor = 'rgba(255,255,255,0.97)';
  const fontSize = clamp(Math.floor(Math.min(w * 0.12, h * 0.2)), 12, 26);
  const valueText = `${size}`;
  const valueFontSize = clamp(
    Math.floor(Math.min(h * 0.86, (w - 8) / Math.max(1, valueText.length * 0.56))),
    20,
    120
  );
  const padding = clamp(Math.round(Math.min(w, h) * 0.09), 8, 16);
  const maxCharsPerLine = Math.max(6, Math.floor((w - padding * 2) / (fontSize * 0.58)));
  const maxLabelLines = Math.max(1, Math.min(3, Math.floor((h - padding * 2) / (fontSize * 1.16))));
  const titleLines = wrapTreemapLabel(node.name, maxCharsPerLine, maxLabelLines);
  const gap = 1;
  const drawX = px + gap * 0.5;
  const drawY = py + gap * 0.5;
  const drawW = Math.max(0, w - gap);
  const drawH = Math.max(0, h - gap);
  const textX = drawX + padding;

  return (
    <g>
      <rect x={drawX} y={drawY} width={drawW} height={drawH} rx={8} ry={8} fill={fill} />
      {canRenderValue && (
        <text
          x={drawX + drawW / 2}
          y={drawY + drawH / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.08)"
          fontSize={valueFontSize}
          fontWeight={800}
        >
          {valueText}
        </text>
      )}
      {canRenderLabel && (
        <>
          {titleLines.map((line, lineIndex) => (
            <text
              key={`${node.id}-${lineIndex}`}
              x={textX}
              y={drawY + padding + fontSize + lineIndex * fontSize * 1.14}
              fill={baseTextColor}
              fontSize={fontSize}
              fontWeight={700}
            >
              {line}
            </text>
          ))}
        </>
      )}
    </g>
  );
}

export function DashboardContent({
  initialNodeId,
  onClose,
  className,
  showCloseButton = false,
  showNodePicker = true,
  onSelectedNodeChange,
}: DashboardContentProps) {
  const t = useTranslation();
  const [, navigateToNode] = useNodeNavigation();
  const [selectedTaskId, setSelectedTaskId] = useState(initialNodeId);
  const [selectedTask, setSelectedTask] = useState<Node | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [showPeriodJumpSheet, setShowPeriodJumpSheet] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [navigateTarget, setNavigateTarget] = useState<TreemapNavigateTarget | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { allowEssentialMotion } = useMotionPreferences();
  const activePickerElRef = useRef<HTMLButtonElement | null>(null);
  const weekListScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedTaskId(initialNodeId);
  }, [initialNodeId]);

  useEffect(() => {
    const loadTask = async () => {
      const task = await getNode(selectedTaskId);
      setSelectedTask(task);
    };
    loadTask();
  }, [selectedTaskId]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setPeriodAnchor((prev) => shiftDashboardAnchor(prev, period, 0));
  }, [period]);

  const stats = useMemo(
    () => (selectedTask ? buildDashboardStats(selectedTask, period, periodAnchor) : null),
    [selectedTask, period, periodAnchor]
  );

  const hasChartData = useMemo(() => {
    if (!stats) return false;
    return stats.trend.some((point) => point.created > 0 || point.closed > 0 || point.cumulativeCreated > 0);
  }, [stats]);

  const periodLabels = useMemo(
    () => ({
      year: t('dashboard.periodYear'),
      quarter: t('dashboard.periodQuarter'),
      month: t('dashboard.periodMonth'),
      week: t('dashboard.periodWeek'),
    }),
    [t]
  );

  const openClosedData = useMemo(
    () =>
      stats
        ? [
            { ...stats.openClosedSplit[0], name: t('dashboard.legendOpen') },
            { ...stats.openClosedSplit[1], name: t('dashboard.legendClosed') },
          ]
        : [],
    [stats, t]
  );

  const deadlineData = useMemo(
    () =>
      stats
        ? [
            { ...stats.deadlineSplit[0], name: t('dashboard.legendWithDeadline') },
            { ...stats.deadlineSplit[1], name: t('dashboard.legendWithoutDeadline') },
          ]
        : [],
    [stats, t]
  );

  const radarData = useMemo(() => {
    if (!stats) return [];
    const labels = [
      t('dashboard.legendMon'),
      t('dashboard.legendTue'),
      t('dashboard.legendWed'),
      t('dashboard.legendThu'),
      t('dashboard.legendFri'),
      t('dashboard.legendSat'),
      t('dashboard.legendSun'),
    ];
    return stats.weekdayClosings.map((item, index) => ({ ...item, name: labels[index] || item.name }));
  }, [stats, t]);

  const kpis = useMemo(
    () =>
      stats
        ? [
            { label: t('dashboard.kpiLeafTotal'), value: stats.summary.leafTotal },
            { label: t('dashboard.kpiOpenNow'), value: stats.summary.openNow },
            { label: t('dashboard.kpiClosedNow'), value: stats.summary.closedNow },
            { label: t('dashboard.kpiCompletionRate'), value: `${stats.summary.completionRateNow}%` },
          ]
        : [],
    [stats, t]
  );

  const currentPeriodLabel = stats?.currentPeriodLabel || t('general.loading');
  const currentTreemapChildren = stats?.topProjects || [];
  const treemapSizeRange = useMemo(() => {
    if (currentTreemapChildren.length === 0) {
      return { min: 0, max: 0 };
    }
    const sizes = currentTreemapChildren.map((item) => item.size);
    return { min: Math.min(...sizes), max: Math.max(...sizes) };
  }, [currentTreemapChildren]);
  const pieOuterRadius = isMobile ? 68 : 88;
  const pieInnerRadius = isMobile ? 38 : 48;
  const pieChartMargin = { top: 4, right: 6, bottom: 4, left: 6 };
  const cartesianChartMargin = { top: 8, right: 8, left: 0, bottom: 8 };
  const radarChartMargin = { top: 16, right: 16, bottom: 16, left: 16 };
  const legendProps = {
    wrapperStyle: {
      fontSize: isMobile ? 11 : 12,
      paddingTop: 0,
      paddingBottom: 0,
      marginBottom: 0,
      lineHeight: '14px',
    },
    iconSize: isMobile ? 10 : 12,
  } as const;
  const pieLegendProps = {
    ...legendProps,
    verticalAlign: 'bottom' as const,
    layout: 'horizontal' as const,
    wrapperStyle: {
      ...legendProps.wrapperStyle,
      paddingTop: 4,
    },
  };

  const handleShiftPeriod = (offset: number) => {
    setPeriodAnchor((prev) => shiftDashboardAnchor(prev, period, offset));
  };

  const applyPeriodJump = (nextPeriod: DashboardPeriod, anchorDate: Date) => {
    const normalized = shiftDashboardAnchor(anchorDate, nextPeriod, 0);
    setPeriod(nextPeriod);
    setPeriodAnchor(normalized);
    setShowPeriodJumpSheet(false);
  };

  const pickerYearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const from = cy - PICKER_YEAR_PAD;
    const to = cy + 4;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, []);

  const pickerWeekStarts = useMemo(() => dashboardWeekStartsInYear(pickerYear), [pickerYear]);

  const openPeriodJumpSheet = () => {
    setPickerYear(periodAnchor.getFullYear());
    setShowPeriodJumpSheet(true);
  };

  useEffect(() => {
    if (!showPeriodJumpSheet) return;

    const behavior: ScrollBehavior = allowEssentialMotion ? 'smooth' : 'auto';

    const scrollActiveIntoView = () => {
      const el = activePickerElRef.current;
      if (!el) return;

      const weekList = weekListScrollRef.current;
      if (period === 'week' && weekList) {
        const nextTop =
          weekList.scrollTop +
          (el.getBoundingClientRect().top - weekList.getBoundingClientRect().top) -
          weekList.clientHeight / 2 +
          el.offsetHeight / 2;
        weekList.scrollTo({ top: Math.max(0, nextTop), behavior });
      }

      el.scrollIntoView({ block: 'center', behavior, inline: 'nearest' });
    };

    const delayMs = allowEssentialMotion ? 440 : 40;
    const t0 = window.setTimeout(scrollActiveIntoView, delayMs);
    const t1 = window.setTimeout(scrollActiveIntoView, delayMs + 180);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [showPeriodJumpSheet, period, periodAnchor, pickerYear, pickerWeekStarts, allowEssentialMotion]);

  const isYearChoiceSelected = (year: number) =>
    period === 'year' && shiftDashboardAnchor(periodAnchor, 'year', 0).getFullYear() === year;

  const isQuarterChoiceSelected = (year: number, quarter: number) => {
    if (period !== 'quarter') return false;
    const d = shiftDashboardAnchor(periodAnchor, 'quarter', 0);
    return d.getFullYear() === year && Math.floor(d.getMonth() / 3) + 1 === quarter;
  };

  const isMonthChoiceSelected = (year: number, monthIndex: number) => {
    if (period !== 'month') return false;
    const d = shiftDashboardAnchor(periodAnchor, 'month', 0);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  };

  const isWeekChoiceSelected = (weekStart: Date) => {
    if (period !== 'week') return false;
    const a = shiftDashboardAnchor(periodAnchor, 'week', 0).getTime();
    const b = shiftDashboardAnchor(weekStart, 'week', 0).getTime();
    return a === b;
  };

  const jumpChipClass = (active: boolean) =>
    `rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors sm:px-3 scroll-my-24 ${
      active
        ? 'text-white ring-2 ring-[rgba(var(--accent-rgb),0.45)] ring-offset-2 ring-offset-white dark:ring-offset-gray-800'
        : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300/65 dark:bg-gray-700/80 dark:text-gray-200 dark:hover:bg-gray-600/65'
    }`;

  const accentFillStyle = { backgroundColor: 'var(--accent)', boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.38)' } as const;
  const handleTreemapClick = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return;
    const data = entry as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id : null;
    const name = typeof data.name === 'string' ? data.name : null;
    if (!id || !name) return;
    setNavigateTarget({ id, name });
  };

  const handleConfirmNavigate = () => {
    if (!navigateTarget) return;
    navigateToNode(navigateTarget.id);
    setNavigateTarget(null);
    onClose?.();
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedTaskId(nodeId);
    onSelectedNodeChange?.(nodeId);
  };

  return (
    <>
      <div className={className ?? 'flex h-full w-full flex-col overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900 lg:rounded-xl'}>
        <div
          className={`space-y-3 px-0 py-3 sm:px-5 sm:py-4 ${
            isMobile ? '' : 'border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
          }`}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">{t('dashboard.title')}</h2>
            {showCloseButton && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200/80 text-gray-600 transition-colors hover:bg-gray-300/70 dark:bg-gray-600/55 dark:text-gray-300 dark:hover:bg-gray-500/55"
                aria-label={t('general.close')}
              >
                <FiX size={16} />
              </button>
            )}
          </div>

          {showNodePicker && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100/90 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/85"
              title={t('dashboard.chooseNodeTooltip')}
            >
              <FiFolder size={16} className="shrink-0" />
              <span className="truncate">{selectedTask?.title || t('general.loading')}</span>
            </button>
          )}

          <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
            <div className="flex w-full min-w-0 items-center gap-1 rounded-lg bg-gray-100 px-1.5 py-2.5 dark:bg-gray-700/60">
              {PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center rounded-md px-1 text-xs font-semibold transition-all sm:px-3 ${
                    item === period
                      ? 'text-white ring-2 ring-[rgba(var(--accent-rgb),0.5)] ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-700/80'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                  style={item === period ? accentFillStyle : undefined}
                >
                  {periodLabels[item]}
                </button>
              ))}
            </div>

            <div className="mt-5 flex w-full min-w-0 gap-1">
              <button
                type="button"
                onClick={() => handleShiftPeriod(-1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] p-0 text-gray-600 transition-colors hover:bg-gray-100 dark:bg-gray-900/55 dark:text-gray-300 dark:hover:bg-gray-800/80"
                title={t('dashboard.periodBack')}
              >
                <FiChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={openPeriodJumpSheet}
                className="flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-white px-2 text-center text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700/80"
                title={t('dashboard.periodJumpOpenHint')}
              >
                <span className="truncate">{currentPeriodLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => handleShiftPeriod(1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] p-0 text-gray-600 transition-colors hover:bg-gray-100 dark:bg-gray-900/55 dark:text-gray-300 dark:hover:bg-gray-800/80"
                title={t('dashboard.periodForward')}
              >
                <FiChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-0 py-3 sm:p-5">
          {!selectedTask || !stats ? (
            <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
              {t('general.loading')}
            </div>
          ) : stats.isLeafSelection ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-yellow-50 p-8 text-center dark:bg-yellow-900/20 lg:rounded-xl">
              <h3 className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{t('dashboard.warningLeafTitle')}</h3>
              <p className="mt-2 text-sm text-yellow-800 dark:text-yellow-200">{t('dashboard.warningLeafText')}</p>
            </div>
          ) : !hasChartData ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-white p-8 text-center dark:bg-gray-800 lg:rounded-xl">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('dashboard.warningNoDataTitle')}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.warningNoDataText')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              <section className="rounded-2xl bg-white p-2 shadow-sm xl:col-span-4 dark:bg-gray-800 lg:rounded-xl">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[640px] grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
                    {kpis.map((item) => (
                      <div key={item.label} className="px-3 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</p>
                        <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <ChartCard
                className="xl:col-span-1"
                title={t('dashboard.chartOpenClosed')}
                chartHeightClassName="h-52 sm:h-60"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={pieChartMargin}>
                    <Pie
                      cx="50%"
                      cy="47%"
                      data={openClosedData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={pieOuterRadius}
                      innerRadius={pieInnerRadius}
                    >
                      {openClosedData.map((item, index) => (
                        <Cell key={item.name} fill={index === 0 ? CHART_COLORS.strong : CHART_COLORS.faint} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend {...pieLegendProps} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                className="xl:col-span-1"
                title={t('dashboard.chartDeadlineSplit')}
                chartHeightClassName="h-52 sm:h-60"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={pieChartMargin}>
                    <Pie
                      cx="50%"
                      cy="47%"
                      data={deadlineData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={pieOuterRadius}
                      innerRadius={pieInnerRadius}
                    >
                      {deadlineData.map((item, index) => (
                        <Cell key={item.name} fill={index === 0 ? CHART_COLORS.medium : CHART_COLORS.whisper} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend {...pieLegendProps} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard className="xl:col-span-2" title={t('dashboard.chartTrend')}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.trend} margin={cartesianChartMargin}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend {...legendProps} />
                    <Line type="monotone" dataKey="created" name={t('dashboard.legendCreated')} stroke={CHART_COLORS.strong} strokeWidth={2} />
                    <Line type="monotone" dataKey="closed" name={t('dashboard.legendClosed')} stroke={CHART_COLORS.faint} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard className="xl:col-span-2" title={t('dashboard.chartCumulative')}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.trend} margin={cartesianChartMargin}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend {...legendProps} />
                    <Area
                      type="monotone"
                      dataKey="cumulativeCreated"
                      name={t('dashboard.legendCreatedCumulative')}
                      fill={CHART_COLORS.medium}
                      stroke={CHART_COLORS.strong}
                      fillOpacity={0.35}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeClosed"
                      name={t('dashboard.legendClosedCumulative')}
                      fill={CHART_COLORS.whisper}
                      stroke={CHART_COLORS.faint}
                      fillOpacity={0.35}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard className="xl:col-span-2" title={t('dashboard.chartNetFlow')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.trend} margin={cartesianChartMargin}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend {...legendProps} />
                    <Bar dataKey="netFlow" name={t('dashboard.legendNetFlow')} fill={CHART_COLORS.strong}>
                      {stats.trend.map((item) => (
                        <Cell key={item.key} fill={item.netFlow >= 0 ? CHART_COLORS.strong : CHART_COLORS.pale} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard className="xl:col-span-2" title={t('dashboard.chartCreatedClosedRate')}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.trend} margin={cartesianChartMargin}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                    <RechartsTooltip />
                    <Legend {...legendProps} />
                    <Bar yAxisId="left" dataKey="created" name={t('dashboard.legendCreated')} fill={CHART_COLORS.strong} />
                    <Bar yAxisId="left" dataKey="closed" name={t('dashboard.legendClosed')} fill={CHART_COLORS.faint} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="completionRate"
                      name={t('dashboard.legendCompletionRate')}
                      stroke={CHART_COLORS.medium}
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard className="xl:col-span-2" title={t('dashboard.chartWeekdayRadar')}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={radarChartMargin}>
                    <PolarGrid stroke={GRID_STROKE} />
                    <PolarAngleAxis dataKey="name" />
                    <PolarRadiusAxis />
                    <Radar dataKey="value" stroke={CHART_COLORS.medium} fill={CHART_COLORS.medium} fillOpacity={0.3} />
                    <RechartsTooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>

              <section className="rounded-2xl bg-white p-4 shadow-sm xl:col-span-4 dark:bg-gray-800 lg:rounded-xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {t('dashboard.chartProjectsTreemap')}
                  </h3>
                </div>
                <div className="h-[300px] sm:h-[380px] xl:h-[440px]">
                  {currentTreemapChildren.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                      {t('dashboard.warningNoDataText')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <Treemap
                        data={currentTreemapChildren}
                        dataKey="size"
                        onClick={handleTreemapClick}
                        content={<TreemapCell minSize={treemapSizeRange.min} maxSize={treemapSizeRange.max} />}
                      >
                        <RechartsTooltip />
                      </Treemap>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      {showNodePicker && showPicker && (
        <DashboardNodePickerModal
          selectedNodeId={selectedTaskId}
          onSelectNode={handleSelectNode}
          onClose={() => setShowPicker(false)}
        />
      )}
      {navigateTarget && (
        <ConfirmDialog
          title={t('dashboard.navigateTitle')}
          message={t('dashboard.navigateMessage').replace('{title}', navigateTarget.name)}
          confirmText={t('dashboard.navigateConfirm')}
          onConfirm={handleConfirmNavigate}
          onCancel={() => setNavigateTarget(null)}
          isDangerous={false}
        />
      )}
      <MobileBottomSheet
        isOpen={showPeriodJumpSheet}
        title={t('dashboard.periodJumpTitle')}
        onClose={() => setShowPeriodJumpSheet(false)}
      >
        <div className="max-h-[min(70vh,560px)] space-y-5 overflow-y-auto scroll-smooth pb-1">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPickerYear((y) => Math.max(1990, y - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-200/85 text-gray-700 transition-colors hover:bg-gray-300/70 dark:bg-gray-600/55 dark:text-gray-200 dark:hover:bg-gray-500/55"
              aria-label={t('dashboard.periodJumpPrevYear')}
            >
              <FiChevronLeft size={18} />
            </button>
            <span className="min-w-[5rem] text-center text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {pickerYear}
            </span>
            <button
              type="button"
              onClick={() => setPickerYear((y) => Math.min(2100, y + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-200/85 text-gray-700 transition-colors hover:bg-gray-300/70 dark:bg-gray-600/55 dark:text-gray-200 dark:hover:bg-gray-500/55"
              aria-label={t('dashboard.periodJumpNextYear')}
            >
              <FiChevronRight size={18} />
            </button>
          </div>

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('dashboard.periodJumpYears')}
            </h4>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {pickerYearOptions.map((y) => {
                const active = isYearChoiceSelected(y);
                return (
                  <button
                    key={y}
                    type="button"
                    ref={
                      active
                        ? (el) => {
                            activePickerElRef.current = el;
                          }
                        : undefined
                    }
                    className={jumpChipClass(active)}
                    style={active ? accentFillStyle : undefined}
                    onClick={() => applyPeriodJump('year', new Date(y, 6, 15))}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('dashboard.periodJumpQuarters')}
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[1, 2, 3, 4].map((q) => {
                const active = isQuarterChoiceSelected(pickerYear, q);
                return (
                  <button
                    key={q}
                    type="button"
                    ref={
                      active
                        ? (el) => {
                            activePickerElRef.current = el;
                          }
                        : undefined
                    }
                    className={jumpChipClass(active)}
                    style={active ? accentFillStyle : undefined}
                    onClick={() => applyPeriodJump('quarter', new Date(pickerYear, (q - 1) * 3, 15))}
                  >
                    {`${pickerYear}-Q${q}`}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('dashboard.periodJumpMonths')}
            </h4>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 12 }, (_, m) => {
                const active = isMonthChoiceSelected(pickerYear, m);
                return (
                  <button
                    key={m}
                    type="button"
                    ref={
                      active
                        ? (el) => {
                            activePickerElRef.current = el;
                          }
                        : undefined
                    }
                    className={jumpChipClass(active)}
                    style={active ? accentFillStyle : undefined}
                    onClick={() => applyPeriodJump('month', new Date(pickerYear, m, 15))}
                  >
                    {new Date(pickerYear, m, 15).toLocaleDateString(undefined, { month: 'short' })}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('dashboard.periodJumpWeeks')}
            </h4>
            <div
              ref={weekListScrollRef}
              className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 scroll-smooth"
            >
              {pickerWeekStarts.map((ws) => {
                const active = isWeekChoiceSelected(ws);
                return (
                  <button
                    key={ws.getTime()}
                    type="button"
                    ref={
                      active
                        ? (el) => {
                            activePickerElRef.current = el;
                          }
                        : undefined
                    }
                    className={`${jumpChipClass(active)} w-full`}
                    style={active ? accentFillStyle : undefined}
                    onClick={() => applyPeriodJump('week', ws)}
                  >
                    {dashboardPeriodLabel(ws, 'week')}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </MobileBottomSheet>
    </>
  );
}
