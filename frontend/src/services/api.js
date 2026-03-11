import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || process.env.API_URL || 'http://localhost:5000';

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
export const accountsAPI = {
  getAll: () => api.get('/accounts'),
  getPlatforms: () => api.get('/accounts/platforms'),
  initiateOAuth: (platform) => api.get(`/accounts/oauth/${platform}`),
  disconnect: (accountId) => api.delete(`/accounts/${accountId}`),
};

// Posts API
export const postsAPI = {
  getAll: (status) => api.get('/posts', { params: { status } }),
  getOne: (postId) => api.get(`/posts/${postId}`),
  create: (data) => api.post('/posts', data),
  update: (postId, data) => api.put(`/posts/${postId}`, data),
  delete: (postId) => api.delete(`/posts/${postId}`),
  publish: (postId) => api.post(`/posts/${postId}/publish`),
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
