// AccountsContext.jsx — fixed version
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { accountsAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const AccountsContext = createContext(null);

export const AccountsProvider = ({ children }) => {
  const [accounts, setAccounts]   = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading]     = useState(true);
  const { isAuthenticated }       = useAuth();

  const fetchAccounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await accountsAPI.getAll();
      // Log to verify pages[] are present
      console.log('accounts[0].pages:', response.data[0]?.pages);
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  }, [isAuthenticated]);

  const fetchPlatforms = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await accountsAPI.getPlatforms();
      setPlatforms(response.data);
    } catch (error) {
      console.error('Failed to fetch platforms:', error);
    }
  }, [isAuthenticated]);

  // Single coordinated fetch — loading only clears when BOTH finish
  useEffect(() => {
    if (!isAuthenticated) {
      setAccounts([]);
      setPlatforms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchAccounts(), fetchPlatforms()])
      .finally(() => setLoading(false));
  }, [isAuthenticated, fetchAccounts, fetchPlatforms]);

  // Handle OAuth redirect ?connected=facebook
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    if (!connected) return;

    toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected!`);
    window.history.replaceState({}, document.title, window.location.pathname);

    Promise.all([fetchAccounts(), fetchPlatforms()]);
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
    await Promise.all([fetchAccounts(), fetchPlatforms()]);
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
  if (!context) throw new Error('useAccounts must be used within an AccountsProvider');
  return context;
};

export default AccountsContext;