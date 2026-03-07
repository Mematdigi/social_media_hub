import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { accountsAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const AccountsContext = createContext(null);

export const AccountsProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();

  const fetchAccounts = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const response = await accountsAPI.getAll();
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  }, [isAuthenticated]);

  const fetchPlatforms = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const response = await accountsAPI.getPlatforms();
      setPlatforms(response.data);
    } catch (error) {
      console.error('Failed to fetch platforms:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAccounts();
      fetchPlatforms();
    } else {
      setAccounts([]);
      setPlatforms([]);
      setLoading(false);
    }
  }, [isAuthenticated, fetchAccounts, fetchPlatforms]);

  // Check for connected query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected!`);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh accounts
      fetchAccounts();
      fetchPlatforms();
    }
  }, [fetchAccounts, fetchPlatforms]);

  const disconnectAccount = async (accountId) => {
    try {
      await accountsAPI.disconnect(accountId);
      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
      await fetchPlatforms();
      toast.success('Account disconnected');
    } catch (error) {
      console.error('Failed to disconnect account:', error);
      toast.error('Failed to disconnect account');
    }
  };

  const refreshAccounts = async () => {
    await fetchAccounts();
    await fetchPlatforms();
  };

  const connectedCount = platforms.filter((p) => p.connected).length;

  return (
    <AccountsContext.Provider value={{
      accounts,
      platforms,
      loading,
      connectedCount,
      disconnectAccount,
      refreshAccounts,
    }}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error('useAccounts must be used within an AccountsProvider');
  }
  return context;
};

export default AccountsContext;
