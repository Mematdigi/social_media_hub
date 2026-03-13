import { useState, useCallback } from 'react';
import { postsAPI } from '../services/api';

export const usePosts = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await postsAPI.getAll();
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
      console.log('Creating post with data:', data);
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
      setPosts((prev) =>
        prev.map((post) => (post.id === postId ? response.data : post))
      );
      return response.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePost = useCallback(async (postId) => {
    setLoading(true);
    setError(null);
    try {
      await postsAPI.delete(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete post');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    posts,
    loading,
    error,
    fetchPosts,
    fetchPost,
    createPost,
    updatePost,
    deletePost,
  };
};

export default usePosts;
