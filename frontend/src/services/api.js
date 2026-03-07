import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('socialhub_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
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
  getAll: () => api.get('/posts'),
  getOne: (postId) => api.get(`/posts/${postId}`),
  create: (data) => api.post('/posts', data),
  update: (postId, data) => api.put(`/posts/${postId}`, data),
  delete: (postId) => api.delete(`/posts/${postId}`),
};

export default api;
