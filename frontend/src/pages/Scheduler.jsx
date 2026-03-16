import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Calendar as CalendarIcon, List, Plus, Clock } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostStatusBadge } from '../components/scheduler/PostStatusBadge';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { schedulerAPI, postsAPI } from '../services/api';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function Scheduler() {
  const navigate = useNavigate();
  const [view, setView] = useState('calendar');
  const [posts, setPosts] = useState([]);
  const [calendarData, setCalendarData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchPosts();
  }, [filter]);

  useEffect(() => {
    fetchCalendarData();
  }, [currentMonth]);

  const fetchPosts = async () => {
    try {
      const response = await postsAPI.getAll(filter === 'all' ? null : filter);
      setPosts(response.data);
    } catch (error) {
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarData = async () => {
    try {
      const response = await schedulerAPI.getCalendar(
        currentMonth.getMonth() + 1,
        currentMonth.getFullYear()
      );
      setCalendarData(response.data);
    } catch (error) {
      console.error('Failed to load calendar data');
    }
  };

  const handlePublish = async (postId) => {
    try {
      await postsAPI.publish(postId);
      toast.success('Post published!');
      fetchPosts();
      fetchCalendarData();
    } catch (error) {
      toast.error('Failed to publish post');
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await postsAPI.delete(postId);
      toast.success('Post deleted');
      fetchPosts();
      fetchCalendarData();
    } catch (error) {
      toast.error('Failed to delete post');
    }
  };

  const tileContent = ({ date }) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayPosts = calendarData[dateStr] || [];
    if (dayPosts.length === 0) return null;
    
    return (
      <div className="flex justify-center gap-0.5 mt-1">
        {dayPosts.slice(0, 3).map((post, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: post.status === 'published' ? '#22C55E' : post.status === 'scheduled' ? '#3B82F6' : '#F59E0B' }}
          />
        ))}
        {dayPosts.length > 3 && <span className="text-[8px] text-slate-500">+{dayPosts.length - 3}</span>}
      </div>
    );
  };

  const handleDateClick = (date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'));
  };

  const selectedDatePosts = selectedDate ? (calendarData[selectedDate] || []) : [];

  if (loading) return <PageWrapper title="Scheduler"><PageLoader /></PageWrapper>;

  return (
    <PageWrapper>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <CalendarIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Scheduler</h1>
              <p className="text-slate-600">Plan and schedule your content</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
  {/* View Toggle (Calendar / List) */}
  <div className="flex bg-slate-100 rounded-xl p-1 w-full sm:w-auto">
    <button
      onClick={() => setView('calendar')}
      className={`flex items-center justify-center flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all ${
        view === 'calendar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <CalendarIcon className="w-4 h-4 mr-1 sm:mr-2" />
      Calendar
    </button>
    <button
      onClick={() => setView('list')}
      className={`flex items-center justify-center flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all ${
        view === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <List className="w-4 h-4 mr-1 sm:mr-2" />
      List
    </button>
  </div>

  {/* Schedule Post Button */}
  <Button
    data-testid="schedule-post-btn"
    className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 w-full sm:w-auto flex justify-center items-center py-2.5 sm:py-2"
    onClick={() => navigate('/posts/new')}
  >
    <Plus className="w-5 h-5 mr-2" />
    Schedule Post
  </Button>
</div>
        </div>
      </motion.div>

      {view === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card">
              <Calendar
                onChange={handleDateClick}
                onActiveStartDateChange={({ activeStartDate }) => setCurrentMonth(activeStartDate)}
                tileContent={tileContent}
                className="w-full border-none"
              />
            </div>
          </div>
          <div>
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card">
              <h3 className="font-heading font-bold text-slate-900 mb-4">
                {selectedDate ? format(new Date(selectedDate), 'MMMM d, yyyy') : 'Select a date'}
              </h3>
              {selectedDate ? (
                selectedDatePosts.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDatePosts.map((post) => (
                      <div key={post.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-sm text-slate-700 mb-2">{post.content}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {post.platforms?.map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                          </div>
                          <PostStatusBadge status={post.status} />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
                          {post.status === 'scheduled' && (
                            <Button size="sm" variant="ghost" className="rounded-lg text-xs text-green-600" onClick={() => handlePublish(post.id)}>Publish Now</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No posts scheduled for this date</p>
                )
              ) : (
                <p className="text-slate-500 text-sm">Click a date to see posts</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
  {/* Filter Tabs (Horizontal Scroll on Mobile) */}
  <div className="flex gap-2 mb-6 overflow-x-auto pb-2 sm:pb-0 w-full snap-x [&::-webkit-scrollbar]:hidden">
    {['all', 'scheduled', 'published', 'draft', 'failed'].map((f) => (
      <button
        key={f}
        onClick={() => setFilter(f)}
        className={`shrink-0 whitespace-nowrap snap-start px-4 py-2 rounded-full text-sm font-medium transition-all ${
          filter === f ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        {f.charAt(0).toUpperCase() + f.slice(1)}
      </button>
    ))}
  </div>

  {posts.length === 0 ? (
    <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center">
      <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <p className="text-slate-600">No posts found</p>
    </div>
  ) : (
    /* Table Container (Allows horizontal scrolling of the table on small screens) */
    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
  
  {/* MOBILE VIEW: Card List (Visible on small screens, hidden on md+) */}
  <div className="block md:hidden divide-y divide-slate-100">
    {posts.map((post) => (
      <div key={post.id} className="p-4 space-y-3 hover:bg-slate-50 transition-colors">
        {/* Top Row: Content & Status Badge */}
        <div className="flex justify-between items-start gap-3">
          <p className="text-sm text-slate-700 line-clamp-2 flex-1">{post.content}</p>
          <div className="shrink-0">
            <PostStatusBadge status={post.status} />
          </div>
        </div>

        {/* Middle Row: Platforms & Date */}
        <div className="flex justify-between items-center bg-slate-50/50 p-2 rounded-lg">
          <div className="flex items-center gap-1">
            {post.platforms?.slice(0, 3).map((p) => (
              <PlatformIcon key={p} platform={p} size="sm" />
            ))}
            {post.platforms?.length > 3 && (
              <span className="text-xs text-slate-500 font-medium ml-1">
                +{post.platforms.length - 3}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-slate-500">
            {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : 'No date set'}
          </span>
        </div>

        {/* Bottom Row: Actions */}
        <div className="flex gap-2 pt-1">
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1 rounded-xl text-slate-600" 
            onClick={() => navigate(`/posts/${post.id}/edit`)}
          >
            Edit
          </Button>
          {post.status === 'scheduled' && (
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 rounded-xl text-green-600 border-green-200 hover:bg-green-50" 
              onClick={() => handlePublish(post.id)}
            >
              Publish
            </Button>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1 rounded-xl text-red-600 border-red-200 hover:bg-red-50" 
            onClick={() => handleDelete(post.id)}
          >
            Delete
          </Button>
        </div>
      </div>
    ))}
  </div>

  {/* DESKTOP VIEW: Traditional Table (Hidden on small screens, visible on md+) */}
  <div className="hidden md:block overflow-x-auto w-full">
    <table className="w-full min-w-[800px]">
      <thead className="bg-slate-50 border-b border-slate-100">
        <tr>
          <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Content</th>
          <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Platforms</th>
          <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Scheduled</th>
          <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Status</th>
          <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {posts.map((post) => (
          <tr key={`desktop-${post.id}`} className="hover:bg-slate-50 transition-colors">
            <td className="px-6 py-4 max-w-xs">
              <p className="text-sm text-slate-700 truncate">{post.content}</p>
            </td>
            <td className="px-6 py-4">
              <div className="flex gap-1">
                {post.platforms?.slice(0, 3).map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                {post.platforms?.length > 3 && <span className="text-xs text-slate-500 self-center">+{post.platforms.length - 3}</span>}
              </div>
            </td>
            <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
              {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : '-'}
            </td>
            <td className="px-6 py-4">
              <PostStatusBadge status={post.status} />
            </td>
            <td className="px-6 py-4">
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="rounded-lg px-3" onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
                {post.status === 'scheduled' && (
                  <Button size="sm" variant="ghost" className="rounded-lg text-green-600 px-3" onClick={() => handlePublish(post.id)}>Publish</Button>
                )}
                <Button size="sm" variant="ghost" className="rounded-lg text-red-600 px-3" onClick={() => handleDelete(post.id)}>Delete</Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
  )}
</div>
      )}

      <style>{`
        .react-calendar { font-family: inherit; border: none; width: 100%; }
        .react-calendar__tile { padding: 1em 0.5em; font-size: 0.875rem; }
        .react-calendar__tile--active { background: #6366F1 !important; border-radius: 12px; }
        .react-calendar__tile--now { background: #EEF2FF; border-radius: 12px; }
        .react-calendar__navigation button { font-size: 1rem; font-weight: 600; }
      `}</style>
    </PageWrapper>
  );
}
