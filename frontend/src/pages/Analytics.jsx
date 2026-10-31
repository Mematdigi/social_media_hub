import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, Eye, TrendingUp, FileText, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageHeader } from '../components/layout/PageHeader';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { analyticsAPI } from '../services/api';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// Chart styling tokens (visual only)
const CHART = {
  grid: '#E7E4F2',
  axis: '#9E98B6',
  tooltip: {
    background: '#FFFFFF',
    border: '1px solid #E7E4F2',
    borderRadius: 12,
    boxShadow: '0 12px 40px -8px rgb(17 21 36 / 0.20)',
    fontSize: 12,
    padding: '8px 12px',
  },
  tooltipLabel: { color: '#18152B', fontWeight: 600, marginBottom: 4 },
  legend: { fontSize: 12, paddingTop: 12, color: '#524C6C' },
};

const MetricCard = ({ icon: Icon, label, value, change, changePercent, color }) => {
  const isPositive = change >= 0;
  const formatValue = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="sh-card sh-card--hover relative overflow-hidden p-4 sm:p-5"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 opacity-80" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-slate-500 mb-2 truncate">{label}</p>
          <p className="text-[1.5rem] sm:text-[1.875rem] leading-none font-heading font-bold text-slate-900 tabular-nums">{formatValue(value)}</p>
          {change !== undefined && (
            <div className={cn('inline-flex items-center gap-1 mt-3 h-6 px-2 rounded-full text-xs font-semibold ring-1 ring-inset', isPositive ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-red-50 text-red-600 ring-red-200')}>
              {isPositive ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
              <span>{changePercent || `${isPositive ? '+' : ''}${change}`}</span>
            </div>
          )}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}26` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </motion.div>
  );
};

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [followersData, setFollowersData] = useState({ dates: [], series: [] });
  const [engagementData, setEngagementData] = useState({ platforms: [], metrics: {} });
  const [topPosts, setTopPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dateRange, setDateRange] = useState('30');

  const startDate = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd');
  const endDate = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, followersRes, engagementRes, postsRes] = await Promise.all([
        analyticsAPI.getOverview(startDate, endDate),
        analyticsAPI.getFollowers(startDate, endDate),
        analyticsAPI.getEngagement(startDate, endDate),
        analyticsAPI.getTopPosts(startDate, endDate),
      ]);
      setOverview(overviewRes.data);
      setFollowersData(followersRes.data);
      setEngagementData(engagementRes.data);
      setTopPosts(postsRes.data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await analyticsAPI.sync();
      toast.success('Analytics synced!');
      fetchData();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Transform data for Recharts
  const lineChartData = followersData.dates.map((date, i) => {
    const point = { date: format(new Date(date), 'MMM d') };
    followersData.series.forEach((s) => {
      point[s.platform] = s.data[i] || 0;
    });
    return point;
  });

  const barChartData = engagementData.platforms.map((platform, i) => ({
    platform,
    likes: engagementData.metrics.likes?.[i] || 0,
    comments: engagementData.metrics.comments?.[i] || 0,
    shares: engagementData.metrics.shares?.[i] || 0,
  }));

  if (loading) return <PageWrapper title="Analytics"><PageLoader /></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="Track your social media performance"
        actions={
          <div className="flex flex-col min-[420px]:flex-row items-stretch min-[420px]:items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* Date Range Selector */}
            <div className="sh-segmented w-full min-[420px]:w-auto">
              {['7', '30', '90'].map((days) => (
                <button
                  key={days}
                  onClick={() => setDateRange(days)}
                  className={cn('sh-segmented__btn flex-1 min-[420px]:flex-none tabular-nums', dateRange === days && 'is-active')}
                >
                  {days}D
                </button>
              ))}
            </div>

            {/* Sync Button */}
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="outline"
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
              Sync Data
            </Button>
          </div>
        }
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <MetricCard icon={Users} label="Total Followers" value={overview?.totalFollowers || 0} change={overview?.followersGrowth} changePercent={overview?.followersGrowthPercent} color="#6366F1" />
        <MetricCard icon={Eye} label="Total Reach" value={overview?.totalReach || 0} color="#A855F7" />
        <MetricCard icon={TrendingUp} label="Avg Engagement" value={`${overview?.avgEngagementRate || 0}%`} color="#EC4899" />
        <MetricCard icon={FileText} label="Published Posts" value={overview?.totalPosts || 0} color="#10B981" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Followers Chart */}
        <div className="sh-card overflow-hidden">
          <div className="sh-card-header">
            <div>
              <h3 className="sh-card-title">Followers Growth</h3>
              <p className="sh-card-subtitle">Audience size over the selected range</p>
            </div>
          </div>
          <div className="p-3 pt-5 sm:p-5">
            {lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} cursor={{ stroke: CHART.grid }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={CHART.legend} />
                  {followersData.series.map((s) => (
                    <Line key={s.platform} type="monotone" dataKey={s.platform} stroke={s.color} strokeWidth={2.25} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] sh-empty">
                <div className="sh-empty__icon"><Users /></div>
                <p className="sh-empty__desc !mb-0">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Engagement Chart */}
        <div className="sh-card overflow-hidden">
          <div className="sh-card-header">
            <div>
              <h3 className="sh-card-title">Engagement by Platform</h3>
              <p className="sh-card-subtitle">Likes, comments and shares</p>
            </div>
          </div>
          <div className="p-3 pt-5 sm:p-5">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="platform" tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} cursor={{ fill: 'rgb(241 243 248 / 0.7)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={CHART.legend} />
                  <Bar dataKey="likes" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="comments" fill="#A855F7" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="shares" fill="#EC4899" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] sh-empty">
                <div className="sh-empty__icon"><BarChart3 /></div>
                <p className="sh-empty__desc !mb-0">No data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Platform Breakdown */}
      {overview?.platformSummary?.length > 0 && (
        <div className="sh-card overflow-hidden mb-4 sm:mb-6">
          <div className="sh-card-header">
            <h3 className="sh-card-title">Platform Breakdown</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {overview.platformSummary.map((platform) => (
              <div
                key={platform.platform}
                className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-4 sm:px-6 hover:bg-slate-50/70 transition-colors gap-3 sm:gap-0"
              >
                {/* Left Side: Platform Icon & Name */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <PlatformIcon platform={platform.platform} size="md" showBackground />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 capitalize text-sm sm:text-[0.9375rem]">{platform.platform}</p>
                    <p className="text-xs sm:text-sm text-slate-500 truncate">{platform.accountName}</p>
                  </div>
                </div>

                {/* Right Side: Stats (Stacks on mobile, horizontal on desktop) */}
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-10 border-t border-slate-100 sm:border-none pt-3 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <p className="sh-eyebrow mb-1">Followers</p>
                    <p className="font-semibold text-slate-900 text-sm sm:text-base tabular-nums">{platform.followers.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="sh-eyebrow mb-1">Engagement</p>
                    <p className="font-semibold text-slate-900 text-sm sm:text-base tabular-nums">{platform.engagementRate}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Posts */}
      <div className="sh-card overflow-hidden">
        <div className="sh-card-header">
          <h3 className="sh-card-title">Top Performing Posts</h3>
        </div>
        {topPosts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="sh-table min-w-[680px]">
              <thead>
                <tr>
                  <th className="text-left">Post</th>
                  <th className="text-left">Platforms</th>
                  <th className="text-right">Likes</th>
                  <th className="text-right">Comments</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Eng. Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((post) => (
                  <tr key={post.id}>
                    <td className="max-w-xs">
                      <p className="text-sm font-medium text-slate-800 truncate">{post.content}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {post.platforms?.map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{post.likes.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{post.comments.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{post.shares.toLocaleString()}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center h-6 px-2 rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200 text-xs font-semibold tabular-nums">{post.engagementRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sh-empty">
            <div className="sh-empty__icon"><FileText /></div>
            <p className="sh-empty__desc !mb-0">No published posts yet</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
