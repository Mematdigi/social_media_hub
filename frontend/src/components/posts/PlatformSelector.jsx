import React from 'react';
import { Link } from 'react-router-dom';
import { Check, AlertCircle } from 'lucide-react';
import { useAccounts } from '../../context/AccountsContext';
import { PlatformIcon } from '../accounts/PlatformIcon';
import { Checkbox } from '../ui/checkbox';
import { cn } from '../../lib/utils';

export const PlatformSelector = ({ selectedIds = [], onChange }) => {
  const { accounts, loading } = useAccounts();

  const handleToggle = (accountId) => {
    if (selectedIds.includes(accountId)) {
      console.log('selecting account:', selectedIds);
      onChange(selectedIds.filter((id) => id !== accountId));
    } else {
      console.log('deselecting account:', accountId);
      onChange([...selectedIds, accountId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === accounts.length) {
      onChange([]);
    } else {
      onChange(accounts.map((acc) => console.log(acc.id)));
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-slate-50 animate-pulse">
        <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">No accounts connected</p>
            <p className="text-sm text-amber-600 mt-1">
              Connect a social account first to create posts.
            </p>
            <Link 
              to="/accounts" 
              className="inline-block mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Go to Accounts →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const allSelected = selectedIds.length === accounts.length;

  return (
    <div className="space-y-3">
      {/* Select All Toggle */}
      <button
        type="button"
        data-testid="select-all-accounts"
        onClick={handleSelectAll}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        {allSelected ? 'Deselect All' : 'Select All'}
      </button>

      {/* Account List */}
      <div className="space-y-2">
        {accounts.map((account) => {
          const isSelected = selectedIds.includes(account.id);
          return (
            <label
              key={account.id}
              data-testid={`account-option-${account.id}`}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
                isSelected
                  ? 'bg-indigo-50 border-2 border-indigo-200'
                  : 'bg-slate-50 border-2 border-transparent hover:border-slate-200'
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle(account.id)}
                className="data-[state=checked]:bg-indigo-600"
              />
              
              <div className="relative">
                <img
                  src={account.profilePicture}
                  alt={account.accountName}
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div className="absolute -bottom-1 -right-1">
                  <PlatformIcon platform={account.platform} size="sm" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {account.accountName}
                </p>
                <p className="text-xs text-slate-500 capitalize">
                  {account.platform.replace('_', ' ')}
                </p>
              </div>

              {isSelected && (
                <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default PlatformSelector;
