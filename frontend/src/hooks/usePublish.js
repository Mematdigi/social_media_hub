// hooks/usePublish.js
import { useState, useCallback } from 'react';
import { postsAPI } from '../services/api';

/**
 * Handles post publishing across platforms.
 * Works with any platform — just pass the right accountIds.
 */
export const usePublish = () => {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishResults, setPublishResults] = useState(null);

  // Publish a post that's already created (by postId)
  const publishPost = useCallback(async (postId) => {
    setPublishing(true);
    setPublishError(null);
    setPublishResults(null);
    try {
      const response = await postsAPI.publish(postId);
      setPublishResults(response.data);
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
      // status: 'published' triggers immediate publish in your backend
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

  // Per-platform result helpers
  const getResultForPlatform = useCallback((platform) => {
    return publishResults?.find(r => r.platform === platform) || null;
  }, [publishResults]);

  const hasFailures = publishResults?.some(r => r.status === 'failed') ?? false;
  const allFailed = publishResults?.every(r => r.status === 'failed') ?? false;

  return {
    publishing,
    publishError,
    publishResults,
    publishPost,
    createAndPublish,
    getResultForPlatform,
    hasFailures,
    allFailed,
  };
};

export default usePublish;