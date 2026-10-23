// hooks/useAISuggestions.js
// One shared set of AI suggestions for the post form. The suggestions are shown
// under each field (title, caption, hashtags, YouTube tags, schedule).
import { useCallback, useEffect, useRef, useState } from 'react';
import { aiAPI } from '../services/api';
import { getAIStatus, loadAIPrefs, saveAIPrefs } from '../utils/aiHelpers';

export const useAISuggestions = () => {
  const saved = useRef(loadAIPrefs()).current;

  const [prefs, setPrefsState] = useState({
    tone: saved.tone || 'friendly',
    language: saved.language || 'english',
    region: saved.region || 'IN',
    audience: saved.audience || '',
    niche: saved.niche || '',
  });
  const [status, setStatus] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [brief, setBrief] = useState('');

  // Texts the current suggestions were made for — used to avoid repeat requests
  const lastRequest = useRef('');
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getAIStatus().then((s) => active && setStatus(s));
    return () => { active = false; };
  }, []);

  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveAIPrefs(next);
      return next;
    });
  }, []);

  // Returns the suggestions, or null when nothing was generated
  const generate = useCallback(async ({
    mode = 'generate',
    topic,
    title = '',
    content = '',
    platforms = [],
    mediaKind = 'none',
    silent = false,
  } = {}) => {
    if (inFlight.current) return null;

    const useBrief = (topic ?? brief ?? '').trim();
    if (!useBrief && !title.trim() && !content.trim()) {
      if (!silent) setError('Type a title, write a caption, or pick a trending topic first.');
      return null;
    }
    if (mode === 'improve' && !content.trim()) {
      if (!silent) setError('Write a caption first, then ask the AI to improve it.');
      return null;
    }

    const key = JSON.stringify([mode, useBrief, title.trim(), content.trim(), platforms, prefs]);
    if (silent && key === lastRequest.current) return null;

    inFlight.current = true;
    lastRequest.current = key;
    setLoading(true);
    setError('');
    if (topic !== undefined) setBrief(topic);

    try {
      const res = await aiAPI.suggest({
        topic: useBrief,
        title,
        content,
        platforms,
        tone: prefs.tone,
        language: prefs.language,
        audience: prefs.audience,
        region: prefs.region,
        mode,
        mediaKind,
      });
      setSuggestions(res.data);
      return res.data;
    } catch (err) {
      lastRequest.current = '';
      setError(err.response?.data?.detail || 'The AI could not generate suggestions. Please try again.');
      return null;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [brief, prefs]);

  const clear = useCallback(() => {
    setSuggestions(null);
    setError('');
    lastRequest.current = '';
  }, []);

  return {
    prefs, setPrefs,
    status,
    suggestions,
    loading,
    error, setError,
    brief, setBrief,
    generate,
    clear,
  };
};

export default useAISuggestions;
