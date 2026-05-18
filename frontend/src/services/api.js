import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('socialhub_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('socialhub_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// Accounts API
// Accounts API — only update this section
export const accountsAPI = {
  getAll:       ()          => api.get('/accounts'),
  getPlatforms: ()          => api.get('/accounts/platforms'),
  disconnect:   (accountId) => api.delete(`/accounts/${accountId}`),

initiateOAuth: async (platform) => {
  const token = localStorage.getItem('socialhub_token');
  if (!token) { window.location.href = '/login'; return; }

  // Check expiry
  const payload = JSON.parse(atob(token.split('.')[1]));
  if (payload.exp * 1000 < Date.now()) {
    localStorage.removeItem('socialhub_token');
    window.location.href = '/login';
    return;
  }

  if (platform === 'threads') {
    return new Promise(async (resolve, reject) => {
      try {
        // ✅ Get popup URL from backend — backend uses JWT to get correct user_id
        const res = await api.get('/accounts/oauth/threads/popup-url');
        const { popupUrl } = res.data;

        // Open popup with URL from backend
        const popup = window.open(
          popupUrl,
          'threads_oauth',
          'width=600,height=700,scrollbars=yes,resizable=yes,left=400,top=100'
        );

        if (!popup) {
          reject(new Error('Popup blocked. Please allow popups.'));
          return;
        }

        const handleMessage = (event) => {
          if (event.origin !== API_URL) return;
          if (event.data?.platform !== 'threads') return;
          window.removeEventListener('message', handleMessage);
          clearInterval(check);
          event.data.success
            ? resolve({ success: true })
            : reject(new Error(event.data.message));
        };

        window.addEventListener('message', handleMessage);

        const check = setInterval(() => {
          if (popup?.closed) {
            clearInterval(check);
            window.removeEventListener('message', handleMessage);
            reject(new Error('Login was cancelled.'));
          }
        }, 500);

      } catch (err) {
        reject(new Error('Failed to get Threads login URL'));
      }
    });
  }

  // All other platforms — full redirect
  const userId = payload.user_id || payload._id || payload.id || payload.userId;
  window.location.href = `${API_URL}/api/accounts/oauth/${platform}?user_id=${userId}`;
},
};
// Posts API
export const postsAPI = {
  getAll:  (status, platform) => api.get('/posts', { params: { status, platform } }),
  getOne:  (postId)           => api.get(`/posts/${postId}`),
  create:  (data)             => api.post('/posts', data),
  update:  (postId, data)     => api.put(`/posts/${postId}`, data),
  delete:  (postId, deleteFromPlatform = true) =>
    api.delete(`/posts/${postId}`, { params: { deleteFromPlatform } }),
  publish: (postId, selectedPages = {}) =>
    api.post(`/posts/${postId}/publish`, { selectedPages }),
  sync:    (platform, accountId) =>
    api.post('/posts/sync', null, { params: { platform, accountId } }),
};

// Scheduler API
export const schedulerAPI = {
  getCalendar: (month, year) => api.get('/scheduler/calendar', { params: { month, year } }),
};

// Inbox API
export const inboxAPI = {
  getMessages: (params) => api.get('/inbox', { params }),
  getUnreadCount: () => api.get('/inbox/unread-count'),
  markRead: (messageId) => api.put(`/inbox/${messageId}/read`),
  markAllRead: (platform) => api.put('/inbox/read-all', null, { params: { platform } }),
  reply: (messageId, content) => api.post(`/inbox/${messageId}/reply`, { content }),
  sync: () => api.post('/inbox/sync'),
};

// Analytics API
export const analyticsAPI = {
  getOverview: (startDate, endDate) => api.get('/analytics/overview', { params: { startDate, endDate } }),
  getFollowers: (startDate, endDate) => api.get('/analytics/followers', { params: { startDate, endDate } }),
  getEngagement: (startDate, endDate) => api.get('/analytics/engagement', { params: { startDate, endDate } }),
  getTopPosts: (startDate, endDate) => api.get('/analytics/posts', { params: { startDate, endDate } }),
  sync: () => api.post('/analytics/sync'),
};

export default api;
