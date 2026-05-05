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
import { FiChevronLeft, FiChevronRight, FiFolder, FiRotateCw } from 'react-icons/fi';
import { getNode } from '../db';
import { useTranslation } from '../i18n';
import { Node } from '../types';
import { Z_MODAL } from '../config/zLayers';
import {
  buildDashboardStats,
  DashboardPeriod,
  DashboardTreemapNode,
  shiftDashboardAnchor,
} from '../utils/dashboardStats';
import { DashboardNodePickerModal } from './DashboardNodePickerModal';

interface DashboardModalProps {
  initialNodeId: string;
  onClose: () => void;
}

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
  index?: number;
  depth?: number;
  payload?: DashboardTreemapNode;
  id?: string;
  name?: string;
  size?: number;
}

const CHART_COLORS = {
  strong: 'rgb(var(--accent-rgb))',
  medium: 'rgba(var(--accent-rgb), 0.9)',
  soft: 'rgba(var(--accent-rgb), 0.82)',
  faint: 'rgba(var(--accent-rgb), 0.74)',
  pale: 'rgba(var(--accent-rgb), 0.66)',
  whisper: 'rgba(var(--accent-rgb), 0.58)',
};
const TREEMAP_COLORS = [
  CHART_COLORS.strong,
  CHART_COLORS.medium,
  CHART_COLORS.soft,
  CHART_COLORS.faint,
  CHART_COLORS.pale,
  CHART_COLORS.whisper,
];
const PERIODS: DashboardPeriod[] = ['year', 'quarter', 'month', 'week'];
const GRID_STROKE = 'rgba(148,163,184,0.18)';

function ChartCard({
  title,
  children,
  className = '',
  chartHeightClassName = 'h-56 sm:h-64',
}: ChartCardProps) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      <div className={chartHeightClassName}>{children}</div>
    </section>
  );
}

function TreemapCell(props: TreemapCellProps) {
  const { x, y, width, height, index, depth, payload } = props;
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
  const idx = index ?? 0;
  const lvl = depth ?? 0;
  if (w <= 0 || h <= 0) return null;
  const fill = TREEMAP_COLORS[(idx + lvl) % TREEMAP_COLORS.length];
  const canRenderLabel = w > 74 && h > 28;
  const canRenderValue = w > 92 && h > 46;
  const title = node.name.length > 26 ? `${node.name.slice(0, 25)}…` : node.name;

  return (
    <g>
      <rect x={px} y={py} width={w} height={h} rx={6} ry={6} fill={fill} stroke="#fff" strokeWidth={2} />
      {canRenderLabel && (
        <text x={px + 8} y={py + 18} fill="#fff" fontSize={12} fontWeight={700}>
          {title}
        </text>
      )}
      {canRenderValue && (
        <text x={px + 8} y={py + 34} fill="rgba(255,255,255,0.9)" fontSize={11}>
          {node.size}
        </text>
      )}
    </g>
  );
}

export function DashboardModal({ initialNodeId, onClose }: DashboardModalProps) {
  const t = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const clickStartRef = useRef<{ inside: boolean } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState(initialNodeId);
  const [selectedTask, setSelectedTask] = useState<Node | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    setPeriodAnchor(prev => shiftDashboardAnchor(prev, period, 0));
  }, [period]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  const stats = useMemo(
    () => (selectedTask ? buildDashboardStats(selectedTask, period, periodAnchor) : null),
    [selectedTask, period, periodAnchor]
  );

  const hasChartData = useMemo(() => {
    if (!stats) return false;
    return stats.trend.some(point => point.created > 0 || point.closed > 0 || point.cumulativeCreated > 0);
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
  const pieOuterRadius = isMobile ? 72 : 92;
  const pieInnerRadius = isMobile ? 40 : 52;

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    clickStartRef.current = {
      inside: modalRef.current?.contains(e.target as globalThis.Node) || false,
    };
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!clickStartRef.current?.inside) {
      const endedInside = modalRef.current?.contains(e.target as globalThis.Node) || false;
      if (!endedInside) onClose();
    }
    clickStartRef.current = null;
  };

  const handleShiftPeriod = (offset: number) => {
    setPeriodAnchor(prev => shiftDashboardAnchor(prev, period, offset));
  };

  const handleResetPeriod = () => {
    setPeriodAnchor(new Date());
  };

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        style={{ zIndex: Z_MODAL }}
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className="mx-2 flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl sm:mx-4 dark:bg-slate-900"
          onClick={e => e.stopPropagation()}
        >
          <div className="border-b border-gray-200 bg-white px-3 py-3 sm:px-5 sm:py-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">
                  {t('dashboard.title')}
                </h2>
              </div>
              <div className="flex h-10 items-center gap-1 rounded-xl bg-gray-100 p-1 md:justify-self-end dark:bg-gray-700">
                {PERIODS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                    className={`h-full rounded-lg px-2.5 text-xs font-semibold transition-all sm:px-3 ${
                      item === period ? 'text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'
                    }`}
                    style={item === period ? { backgroundColor: 'var(--accent)' } : undefined}
                  >
                    {periodLabels[item]}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-accent/50 md:max-w-[460px] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                title={t('dashboard.chooseNodeTooltip')}
              >
                <FiFolder size={16} className="shrink-0" />
                <span className="truncate">{selectedTask?.title || t('general.loading')}</span>
              </button>
              <div className="flex items-center gap-1 md:justify-self-end">
                <button
                  type="button"
                  onClick={() => handleShiftPeriod(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 p-0 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  title={t('dashboard.periodBack')}
                >
                  <FiChevronLeft size={15} />
                </button>
                <div className="flex h-9 min-w-[126px] items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-center text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                  {currentPeriodLabel}
                </div>
                <button
                  type="button"
                  onClick={() => handleShiftPeriod(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 p-0 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  title={t('dashboard.periodForward')}
                >
                  <FiChevronRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleResetPeriod}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 p-0 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  title={t('dashboard.periodReset')}
                >
                  <FiRotateCw size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            {!selectedTask || !stats ? (
              <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
                {t('general.loading')}
              </div>
            ) : stats.isLeafSelection ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-yellow-50 p-8 text-center dark:bg-yellow-900/20">
                <h3 className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{t('dashboard.warningLeafTitle')}</h3>
                <p className="mt-2 text-sm text-yellow-800 dark:text-yellow-200">{t('dashboard.warningLeafText')}</p>
              </div>
            ) : !hasChartData ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-white p-8 text-center dark:bg-gray-800">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('dashboard.warningNoDataTitle')}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.warningNoDataText')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                <section className="rounded-2xl bg-white p-2 shadow-sm xl:col-span-4 dark:bg-gray-800">
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[640px] grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
                      {kpis.map(item => (
                        <div key={item.label} className="px-3 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</p>
                          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <ChartCard className="xl:col-span-1" title={t('dashboard.chartOpenClosed')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={openClosedData} dataKey="value" nameKey="name" outerRadius={pieOuterRadius} innerRadius={pieInnerRadius}>
                        {openClosedData.map((item, index) => (
                          <Cell key={item.name} fill={index === 0 ? CHART_COLORS.strong : CHART_COLORS.faint} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-1" title={t('dashboard.chartDeadlineSplit')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={deadlineData} dataKey="value" nameKey="name" outerRadius={pieOuterRadius} innerRadius={pieInnerRadius}>
                        {deadlineData.map((item, index) => (
                          <Cell key={item.name} fill={index === 0 ? CHART_COLORS.medium : CHART_COLORS.whisper} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-2" title={t('dashboard.chartTrend')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                      <YAxis />
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
                      <Line type="monotone" dataKey="created" name={t('dashboard.legendCreated')} stroke={CHART_COLORS.strong} strokeWidth={2} />
                      <Line type="monotone" dataKey="closed" name={t('dashboard.legendClosed')} stroke={CHART_COLORS.faint} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-2" title={t('dashboard.chartCumulative')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                      <YAxis />
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
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
                    <BarChart data={stats.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                      <YAxis />
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
                      <Bar dataKey="netFlow" name={t('dashboard.legendNetFlow')} fill={CHART_COLORS.strong}>
                        {stats.trend.map(item => (
                          <Cell key={item.key} fill={item.netFlow >= 0 ? CHART_COLORS.strong : CHART_COLORS.pale} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard className="xl:col-span-2" title={t('dashboard.chartCreatedClosedRate')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stats.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={isMobile ? 28 : 10} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                      <RechartsTooltip />
                      {!isMobile && <Legend />}
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
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={GRID_STROKE} />
                      <PolarAngleAxis dataKey="name" />
                      <PolarRadiusAxis />
                      <Radar dataKey="value" stroke={CHART_COLORS.medium} fill={CHART_COLORS.medium} fillOpacity={0.3} />
                      <RechartsTooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <section className="rounded-2xl bg-white p-4 shadow-sm xl:col-span-4 dark:bg-gray-800">
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
                          content={<TreemapCell />}
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
      </div>
      {showPicker && (
        <DashboardNodePickerModal
          selectedNodeId={selectedTaskId}
          onSelectNode={setSelectedTaskId}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
