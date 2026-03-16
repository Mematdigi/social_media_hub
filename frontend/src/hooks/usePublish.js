import { useState, useCallback } from 'react';
import { postsAPI } from '../services/api';

export const usePublish = () => {
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishResults, setPublishResults] = useState(null);

  // Publish an already-created post (draft → published)
  // Pass selectedPages so the right Facebook pages are targeted
  const publishPost = useCallback(async (postId, selectedPages = {}) => {
    setPublishing(true);
    setPublishError(null);
    setPublishResults(null);
    try {
      const response = await postsAPI.publish(postId, selectedPages);
      setPublishResults(response.data.platformResults);
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to publish post';
      setPublishError(msg);
      throw err;
    } finally {
      setPublishing(false);
    }
  }, []);

  // Create + publish immediately in one shot
  const createAndPublish = useCallback(async (data) => {
    setPublishing(true);
    setPublishError(null);
    setPublishResults(null);
    try {
      // status: 'published' triggers immediate publish in the backend
      // selectedPages flows through data untouched
      const response = await postsAPI.create({ ...data, status: 'published' });
      setPublishResults(response.data.platformResults);
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create and publish post';
      setPublishError(msg);
      throw err;
    } finally {
      setPublishing(false);
    }
  }, []);

  const getResultForPlatform = useCallback((platform) => {
    return publishResults?.find(r => r.platform === platform) || null;
  }, [publishResults]);

  // Per-page results for Facebook
  const getPageResults = useCallback((platform) => {
    const result = publishResults?.find(r => r.platform === platform);
    return result?.pages || [];
  }, [publishResults]);

  const hasFailures = publishResults?.some(r => r.status === 'failed') ?? false;
  const allFailed   = publishResults?.every(r => r.status === 'failed') ?? false;

  return {
    publishing,
    publishError,
    publishResults,
    publishPost,
    createAndPublish,
    getResultForPlatform,
    getPageResults,
    hasFailures,
    allFailed,
  };
};

export default usePublish;