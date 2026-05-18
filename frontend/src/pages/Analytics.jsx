import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, Eye, TrendingUp, FileText, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { analyticsAPI } from '../services/api';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const MetricCard = ({ icon: Icon, label, value, change, changePercent, color }) => {
  const isPositive = change >= 0;
  const formatValue = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card hover:shadow-card-hover transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
          <p className="text-3xl font-heading font-bold text-slate-900">{formatValue(value)}</p>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 mt-2 text-sm font-medium', isPositive ? 'text-green-600' : 'text-red-600')}>
              {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              <span>{changePercent || `${isPositive ? '+' : ''}${change}`}</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-6 h-6" style={{ color }} />
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Analytics</h1>
              <p className="text-slate-600">Track your social media performance</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
  {/* Date Range Selector */}
  <div className="flex bg-slate-100 rounded-xl p-1 w-full sm:w-auto">
    {['7', '30', '90'].map((days) => (
      <button
        key={days}
        onClick={() => setDateRange(days)}
        className={cn(
          'flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap',
          dateRange === days ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'
        )}
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
    className="rounded-xl w-full sm:w-auto flex justify-center items-center py-2 sm:py-auto"
  >
    <RefreshCw className={cn('w-4 h-4 mr-2', syncing && 'animate-spin')} />
    Sync Data
  </Button>
</div>
        </div>
      </motion.div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={Users} label="Total Followers" value={overview?.totalFollowers || 0} change={overview?.followersGrowth} changePercent={overview?.followersGrowthPercent} color="#6366F1" />
        <MetricCard icon={Eye} label="Total Reach" value={overview?.totalReach || 0} color="#8B5CF6" />
        <MetricCard icon={TrendingUp} label="Avg Engagement" value={`${overview?.avgEngagementRate || 0}%`} color="#EC4899" />
        <MetricCard icon={FileText} label="Published Posts" value={overview?.totalPosts || 0} color="#14B8A6" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Followers Chart */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card">
          <h3 className="font-heading font-bold text-slate-900 mb-6">Followers Growth</h3>
          {lineChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip />
                <Legend />
                {followersData.series.map((s) => (
                  <Line key={s.platform} type="monotone" dataKey={s.platform} stroke={s.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">No data available</div>
          )}
        </div>

        {/* Engagement Chart */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card">
          <h3 className="font-heading font-bold text-slate-900 mb-6">Engagement by Platform</h3>
          {barChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="platform" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="likes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" fill="#F97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="shares" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">No data available</div>
          )}
        </div>
      </div>

      {/* Platform Breakdown */}
      {overview?.platformSummary?.length > 0 && (
  <div className="bg-white rounded-3xl border border-slate-100 p-4 sm:p-6 shadow-card mb-8">
    <h3 className="font-heading font-bold text-slate-900 mb-4 sm:mb-6">Platform Breakdown</h3>
    <div className="space-y-3 sm:space-y-4">
      {overview.platformSummary.map((platform) => (
        <div 
          key={platform.platform} 
          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors gap-3 sm:gap-0"
        >
          {/* Left Side: Platform Icon & Name */}
          <div className="flex items-center gap-3 sm:gap-4">
            <PlatformIcon platform={platform.platform} size="lg" showBackground />
            <div>
              <p className="font-medium text-slate-900 capitalize text-sm sm:text-base">{platform.platform}</p>
              <p className="text-xs sm:text-sm text-slate-500">{platform.accountName}</p>
            </div>
          </div>

          {/* Right Side: Stats (Stacks on mobile, horizontal on desktop) */}
          <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 border-t border-slate-200 sm:border-none pt-3 sm:pt-0 mt-1 sm:mt-0">
            <div className="text-left sm:text-right">
              <p className="text-xs sm:text-sm text-slate-500 mb-0.5">Followers</p>
              <p className="font-bold text-slate-900 text-sm sm:text-base">{platform.followers.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm text-slate-500 mb-0.5">Engagement</p>
              <p className="font-bold text-slate-900 text-sm sm:text-base">{platform.engagementRate}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

      {/* Top Posts */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card">
        <h3 className="font-heading font-bold text-slate-900 mb-6">Top Performing Posts</h3>
        {topPosts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Post</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Platforms</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Likes</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Comments</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Shares</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Eng. Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-sm text-slate-700 truncate">{post.content}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        {post.platforms?.map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-slate-700">{post.likes.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-700">{post.comments.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-sm text-slate-700">{post.shares.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">{post.engagementRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400">No published posts yet</div>
        )}
      </div>
    </PageWrapper>
  );
}
