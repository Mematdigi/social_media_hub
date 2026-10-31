import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Calendar as CalendarIcon, List, Plus, Clock } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageHeader } from '../components/layout/PageHeader';
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

   useEffect(() => {
    fetchPosts();
  }, [filter]);

  useEffect(() => {
    fetchCalendarData();
  }, [currentMonth]);


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
      <div className="flex items-center justify-center gap-[3px] mt-1.5">
        {dayPosts.slice(0, 3).map((post, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full ring-2 ring-white/70"
            style={{ backgroundColor: post.status === 'published' ? '#10B981' : post.status === 'scheduled' ? '#A855F7' : '#F59E0B' }}
          />
        ))}
        {dayPosts.length > 3 && <span className="text-[9px] font-semibold leading-none opacity-70">+{dayPosts.length - 3}</span>}
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
      <PageHeader
        icon={CalendarIcon}
        title="Scheduler"
        subtitle="Plan and schedule your content"
        actions={
          <div className="flex flex-col min-[420px]:flex-row items-stretch min-[420px]:items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* View Toggle (Calendar / List) */}
            <div className="sh-segmented w-full min-[420px]:w-auto">
              <button
                onClick={() => setView('calendar')}
                className={`sh-segmented__btn flex-1 min-[420px]:flex-none ${view === 'calendar' ? 'is-active' : ''}`}
              >
                <CalendarIcon className="w-4 h-4" />
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`sh-segmented__btn flex-1 min-[420px]:flex-none ${view === 'list' ? 'is-active' : ''}`}
              >
                <List className="w-4 h-4" />
                List
              </button>
            </div>

            {/* Schedule Post Button */}
            <Button
              data-testid="schedule-post-btn"
              className="px-5"
              onClick={() => navigate('/posts/new')}
            >
              <Plus className="w-4 h-4" />
              Schedule Post
            </Button>
          </div>
        }
      />

      {view === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
          <div className="lg:col-span-2">
            <div className="sh-card p-3 sm:p-6">
              <Calendar
                onChange={handleDateClick}
                onActiveStartDateChange={({ activeStartDate }) => setCurrentMonth(activeStartDate)}
                tileContent={tileContent}
                className="sh-calendar w-full border-none"
              />
              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
                {[['Published', '#10B981'], ['Scheduled', '#A855F7'], ['Draft', '#F59E0B']].map(([label, color]) => (
                  <span key={label} className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:sticky lg:top-6">
            <div className="sh-card overflow-hidden">
              <div className="sh-card-header">
                <div className="min-w-0">
                  <p className="sh-eyebrow mb-1">Selected day</p>
                  <h3 className="sh-card-title truncate">
                    {selectedDate ? format(new Date(selectedDate), 'MMMM d, yyyy') : 'Select a date'}
                  </h3>
                </div>
                {selectedDate && selectedDatePosts.length > 0 && (
                  <span className="sh-chip__count !bg-indigo-50 !text-indigo-700">{selectedDatePosts.length}</span>
                )}
              </div>
              <div className="p-4 sm:p-5">
                {selectedDate ? (
                  selectedDatePosts.length > 0 ? (
                    <div className="space-y-3">
                      {selectedDatePosts.map((post) => (
                        <div key={post.id} className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                          <p className="text-sm text-slate-700 leading-relaxed mb-3 line-clamp-3">{post.content}</p>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-1.5">
                              {post.platforms?.map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                            </div>
                            <PostStatusBadge status={post.status} />
                          </div>
                          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200/70">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
                            {post.status === 'scheduled' && (
                              <Button size="sm" variant="outline" className="h-8 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800 hover:border-green-300" onClick={() => handlePublish(post.id)}>Publish Now</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sh-empty !py-8">
                      <div className="sh-empty__icon !w-11 !h-11"><Clock /></div>
                      <p className="sh-empty__desc !mb-0">No posts scheduled for this date</p>
                    </div>
                  )
                ) : (
                  <div className="sh-empty !py-8">
                    <div className="sh-empty__icon !w-11 !h-11"><CalendarIcon /></div>
                    <p className="sh-empty__desc !mb-0">Click a date to see posts</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Tabs (Horizontal Scroll on Mobile) */}
          <div className="flex gap-2 mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto w-full snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {['all', 'scheduled', 'published', 'draft', 'failed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`sh-chip snap-start ${filter === f ? 'is-active' : ''}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {posts.length === 0 ? (
            <div className="sh-card sh-empty py-14">
              <div className="sh-empty__icon"><Clock /></div>
              <p className="sh-empty__desc !mb-0">No posts found</p>
            </div>
          ) : (
            /* Table Container (Allows horizontal scrolling of the table on small screens) */
            <div className="sh-card overflow-hidden">

              {/* MOBILE VIEW: Card List (Visible on small screens, hidden on md+) */}
              <div className="block md:hidden divide-y divide-slate-100">
                {posts.map((post) => (
                  <div key={post.id} className="p-4 space-y-3">
                    {/* Top Row: Content & Status Badge */}
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2 flex-1">{post.content}</p>
                      <div className="shrink-0">
                        <PostStatusBadge status={post.status} />
                      </div>
                    </div>

                    {/* Middle Row: Platforms & Date */}
                    <div className="flex justify-between items-center bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg">
                      <div className="flex items-center gap-1.5">
                        {post.platforms?.slice(0, 3).map((p) => (
                          <PlatformIcon key={p} platform={p} size="sm" />
                        ))}
                        {post.platforms?.length > 3 && (
                          <span className="text-xs text-slate-500 font-medium ml-1">
                            +{post.platforms.length - 3}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : 'No date set'}
                      </span>
                    </div>

                    {/* Bottom Row: Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9"
                        onClick={() => navigate(`/posts/${post.id}/edit`)}
                      >
                        Edit
                      </Button>
                      {post.status === 'scheduled' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-9 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800 hover:border-green-300"
                          onClick={() => handlePublish(post.id)}
                        >
                          Publish
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
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
                <table className="sh-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th className="text-left">Content</th>
                      <th className="text-left">Platforms</th>
                      <th className="text-left">Scheduled</th>
                      <th className="text-left">Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={`desktop-${post.id}`}>
                        <td className="max-w-xs">
                          <p className="text-sm font-medium text-slate-800 truncate">{post.content}</p>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            {post.platforms?.slice(0, 3).map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                            {post.platforms?.length > 3 && <span className="text-xs text-slate-500 self-center">+{post.platforms.length - 3}</span>}
                          </div>
                        </td>
                        <td className="!text-slate-500 whitespace-nowrap tabular-nums">
                          {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, h:mm a') : '-'}
                        </td>
                        <td>
                          <PostStatusBadge status={post.status} />
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="px-3" onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
                            {post.status === 'scheduled' && (
                              <Button size="sm" variant="ghost" className="px-3 text-green-700 hover:text-green-800 hover:bg-green-50" onClick={() => handlePublish(post.id)}>Publish</Button>
                            )}
                            <Button size="sm" variant="ghost" className="px-3 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(post.id)}>Delete</Button>
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
    </PageWrapper>
  );
}
