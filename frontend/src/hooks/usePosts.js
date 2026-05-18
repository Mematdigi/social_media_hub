import { useState, useCallback } from 'react';
import { postsAPI } from '../services/api';

export const usePosts = () => {
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError]     = useState(null);

  const fetchPosts = useCallback(async (status, platform) => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.getAll(status, platform);
      setPosts(response.data);
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch posts');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPost = useCallback(async (postId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.getOne(postId);
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPost = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.create(data);
      setPosts((prev) => [response.data, ...prev]);
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePost = useCallback(async (postId, data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.update(postId, data);
      setPosts((prev) => prev.map((p) => (p.id === postId ? response.data : p)));
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // deleteFromPlatform=true  → removes from Facebook/etc AND your DB
  // deleteFromPlatform=false → removes only from your DB (post stays live)
  const deletePost = useCallback(async (postId, deleteFromPlatform = true) => {
    setLoading(true);
    setError(null);
    try {
      await postsAPI.delete(postId, deleteFromPlatform);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Publish a saved draft — pass selectedPages from PlatformSelector state
  const publishPost = useCallback(async (postId, selectedPages = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.publish(postId, selectedPages);
      setPosts((prev) => prev.map((p) =>
        p.id === postId
          ? { ...p, status: response.data.status, platformResults: response.data.platformResults }
          : p
      ));
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to publish post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Pull posts FROM social platforms INTO your DB
  // platform & accountId are optional filters
  const syncPosts = useCallback(async (platform, accountId) => {
    setSyncing(true);
    setError(null);
    try {
      const response = await postsAPI.sync(platform, accountId);
      // Refresh list if anything new came in
      if (response.data.total > 0) {
        const refreshed = await postsAPI.getAll();
        setPosts(refreshed.data);
      }
      return response.data; // { total, message, results }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sync posts');
      throw err;
    } finally {
      setSyncing(false);
    }
  }, []);

  return {
    posts,
    loading,
    syncing,
    error,
    fetchPosts,
    fetchPost,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    syncPosts,
  };
};

export default usePosts;