import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  BarChart3,
  Users,
  Eye,
  Smartphone,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Globe,
  Activity
} from 'lucide-react';
import { api } from '../api';
import { AdminAnalyticsResponse } from '../types';

interface AnalyticsDashboardProps {
  ga4Id?: string;
  gtmId?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  ga4Id,
  gtmId
}) => {
  const [range, setRange] = useState<'7d' | '14d' | '30d'>('14d');
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async (selectedRange: '7d' | '14d' | '30d' = range) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminAnalytics(selectedRange);
      setAnalytics(res);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات الإحصائيات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(range);
  }, [range]);

  const activeGaId = analytics?.measurementId || ga4Id || 'G-NX1MQ9NHXW';
  const activeGtmId = analytics?.gtmId || gtmId || 'GTM-TRZ4SG95';

  const topPagesChartData = (analytics?.pages || []).slice(0, 8).map(p => ({
    name: p.title.replace(/\s*\|.*$/, '').slice(0, 26) + (p.title.length > 26 ? '…' : ''),
    fullTitle: p.title,
    path: p.path,
    views: p.views,
    uniqueVisitors: p.uniqueVisitors
  }));

  const gridStroke = '#e7e5e4';
  const tickFill = '#57534e';
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderColor: '#e7e5e4',
    color: '#1c1917',
    borderRadius: '12px',
    fontSize: '12px',
    direction: 'rtl',
    textAlign: 'right'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-stone-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-700" />
            <span>إحصائيات الزيارات و Google Analytics</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            رصد فعلي لاتجاهات الزيارات اليومية والزوار الفريدين والصفحات الأكثر تصفحاً ومصادر الدخول.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
            {([
              { id: '7d', label: '7 أيام' },
              { id: '14d', label: '14 يوماً' },
              { id: '30d', label: '30 يوماً' }
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  range === opt.id
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadAnalytics(range)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <a
            href="https://analytics.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>لوحة Google GA4</span>
          </a>
        </div>
      </div>

      {/* Connected Identifiers Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
            <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Google Analytics 4 متصل</span>
          </div>
          <code className="text-xs font-mono font-bold text-emerald-800 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg" dir="ltr">
            {activeGaId}
          </code>
        </div>

        <div className="p-3.5 rounded-2xl border border-blue-200 bg-blue-50/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
            <Globe className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Google Tag Manager مفعّل</span>
          </div>
          <code className="text-xs font-mono font-bold text-blue-800 bg-white border border-blue-200 px-2.5 py-1 rounded-lg" dir="ltr">
            {activeGtmId}
          </code>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-bold">إجمالي المشاهدات ({range === '7d' ? '7 أيام' : range === '30d' ? '30 يوماً' : '14 يوماً'})</span>
            <Eye className="w-4 h-4 text-red-700" />
          </div>
          <p className="text-2xl font-black text-stone-900 tabular-nums">
            {analytics?.summary?.totalVisits ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-bold">الزوار الفريدون</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 tabular-nums">
            {analytics?.summary?.uniqueVisitors ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
          <div className="flex items-center justify-between text-amber-900">
            <span className="text-[11px] font-bold">زيارات اليوم</span>
            <TrendingUp className="w-4 h-4 text-amber-700" />
          </div>
          <p className="text-2xl font-black text-amber-700 tabular-nums">
            {analytics?.summary?.todayVisits ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-bold">نسبة تصفح الهواتف</span>
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-stone-900 tabular-nums">
            {analytics?.summary?.mobileSharePct ?? 0}%
          </p>
        </div>
      </div>

      {/* Daily Visitor Trends (Recharts AreaChart) */}
      <div className="p-5 rounded-3xl bg-stone-50 border border-stone-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-stone-900">
              الاتجاه اليومي للزوار ومشاهدات الصفحات
            </h3>
            <p className="text-[11px] text-stone-500">
              مقارنة بين عدد المشاهدات اليومية والزوار الفريدين خلال الفترة المحددة
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <span className="w-2.5 h-2.5 rounded-full bg-red-700 inline-block" />
              <span>المشاهدات</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span>الزوار الفريدون</span>
            </span>
          </div>
        </div>

        <div className="h-72 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics?.daily || []} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nfpViewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#b91c1c" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="nfpVisitorsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: tickFill, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: gridStroke }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: tickFill, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: any, name: any) => [
                  value,
                  name === 'pageViews' ? 'المشاهدات' : 'الزوار الفريدون'
                ]}
              />
              <Area
                type="monotone"
                dataKey="pageViews"
                name="pageViews"
                stroke="#b91c1c"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#nfpViewsGrad)"
              />
              <Area
                type="monotone"
                dataKey="visitors"
                name="visitors"
                stroke="#d97706"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#nfpVisitorsGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Most Visited Pages (BarChart) & Traffic Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 p-5 rounded-3xl bg-stone-50 border border-stone-200 space-y-4">
          <div>
            <h3 className="text-sm font-black text-stone-900">
              الصفحات الأكثر زيارة
            </h3>
            <p className="text-[11px] text-stone-500">
              أعلى الصفحات العامة استقبالاً للزوار والمشاهدات
            </p>
          </div>

          {topPagesChartData.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-500 bg-white rounded-2xl border border-dashed border-stone-300">
              لم تُسجل زيارات للصفحات العامة بعد — بمجرد تصفح الزوار للموقع ستظهر الإحصائيات الفعلية هنا مباشرة.
            </div>
          ) : (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPagesChartData} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="path"
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: tickFill, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: any, name: any) => [
                      value,
                      name === 'views' ? 'المشاهدات' : 'الزوار الفريدون'
                    ]}
                    labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullTitle || _label}
                  />
                  <Bar dataKey="views" name="views" fill="#b91c1c" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Sources & Detailed Top Pages */}
        <div className="lg:col-span-5 p-5 rounded-3xl bg-stone-50 border border-stone-200 space-y-4">
          <h3 className="text-sm font-black text-stone-900">
            مصادر الزيارات
          </h3>

          {(analytics?.sources || []).length === 0 ? (
            <p className="text-xs text-stone-500">
              سيتم عرض مصادر الدخول (بحث Google، Facebook، WhatsApp، زيارة مباشرة) تلقائياً مع حركة الزوار.
            </p>
          ) : (
            <div className="space-y-2.5">
              {(analytics?.sources || []).map(src => (
                <div key={src.source} className="bg-white p-3 rounded-xl border border-stone-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                    <span>{src.source}</span>
                    <span className="tabular-nums text-red-700">
                      {src.visits} ({src.sharePct ?? 0}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-700 rounded-full"
                      style={{ width: `${Math.min(100, src.sharePct ?? 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(analytics?.pages || []).length > 0 && (
            <div className="pt-3 border-t border-stone-200 space-y-2">
              <h4 className="text-xs font-black text-stone-700">
                أكثر الصفحات تصفحاً
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(analytics?.pages || []).slice(0, 6).map(p => (
                  <div
                    key={p.path}
                    className="flex items-center justify-between gap-2 text-xs bg-white px-3 py-2 rounded-xl border border-stone-200"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 truncate">{p.title}</p>
                      <p className="text-[10px] font-mono text-stone-400 truncate" dir="ltr">{p.path}</p>
                    </div>
                    <span className="font-black text-red-700 tabular-nums shrink-0">
                      {p.views}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
