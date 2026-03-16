import React from 'react';
import { Link } from 'react-router-dom';
import { Check, AlertCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAccounts } from '../../context/AccountsContext';
import { PlatformIcon } from '../accounts/PlatformIcon';
import { Checkbox } from '../ui/checkbox';
import { cn } from '../../lib/utils';

// Platforms that have sub-pages to select
const PAGE_PLATFORMS = ['facebook', 'linkedin'];

// ─── PlatformSelector ─────────────────────────────────────────────────────────
// Props:
//   selectedIds    string[]  — selected account IDs
//   selectedPages  object    — { [accountId]: [pageId, ...] }
//   onChange       fn        — ({ accountIds, selectedPages }) => void
export const PlatformSelector = ({ selectedIds = [], selectedPages = {}, onChange }) => {
  const { accounts, loading } = useAccounts();
  const [expanded, setExpanded] = React.useState({});

  const isPagePlatform = (account) =>
    PAGE_PLATFORMS.includes(account.platform) && account.pages?.length > 0;

  // ── Toggle account ──────────────────────────────────────────────────────────
  const handleToggleAccount = (account) => {
    const isSelected = selectedIds.includes(account.id);
    let newIds  = isSelected
      ? selectedIds.filter((id) => id !== account.id)
      : [...selectedIds, account.id];

    let newPages = { ...selectedPages };

    if (isSelected) {
      // deselecting — clear page selections
      delete newPages[account.id];
    } else if (isPagePlatform(account)) {
      // selecting a page-platform — auto-select all pages + expand
      newPages[account.id] = account.pages.map((p) => p.pageId);
      setExpanded((prev) => ({ ...prev, [account.id]: true }));
    }

    onChange({ accountIds: newIds, selectedPages: newPages });
  };

  // ── Toggle single page ──────────────────────────────────────────────────────
  const handleTogglePage = (account, pageId) => {
    const current    = selectedPages[account.id] || [];
    const hasPage    = current.includes(pageId);
    const newPageIds = hasPage
      ? current.filter((id) => id !== pageId)
      : [...current, pageId];

    const newPages = { ...selectedPages, [account.id]: newPageIds };
    let newIds = [...selectedIds];

    if (newPageIds.length === 0) {
      // no pages left → deselect account too
      newIds = selectedIds.filter((id) => id !== account.id);
      delete newPages[account.id];
    } else if (!selectedIds.includes(account.id)) {
      newIds = [...selectedIds, account.id];
    }

    onChange({ accountIds: newIds, selectedPages: newPages });
  };

  // ── Select all accounts + all their pages ───────────────────────────────────
  const handleSelectAll = () => {
    if (selectedIds.length === accounts.length) {
      onChange({ accountIds: [], selectedPages: {} });
      setExpanded({});
    } else {
      const newIds      = accounts.map((a) => a.id);   // ← BUG FIX: was console.log(acc.id)
      const newPages    = {};
      const newExpanded = {};
      accounts.forEach((a) => {
        if (isPagePlatform(a)) {
          newPages[a.id]    = a.pages.map((p) => p.pageId);
          newExpanded[a.id] = true;
        }
      });
      onChange({ accountIds: newIds, selectedPages: newPages });
      setExpanded(newExpanded);
    }
  };

  // ── Select all pages for one account ───────────────────────────────────────
  const handleSelectAllPages = (account) => {
    const allPageIds = account.pages.map((p) => p.pageId);
    const current    = selectedPages[account.id] || [];
    const allChosen  = allPageIds.every((id) => current.includes(id));

    const newPageIds = allChosen ? [] : allPageIds;
    const newPages   = { ...selectedPages, [account.id]: newPageIds };
    let   newIds     = [...selectedIds];

    if (newPageIds.length === 0) {
      newIds = selectedIds.filter((id) => id !== account.id);
      delete newPages[account.id];
    } else if (!selectedIds.includes(account.id)) {
      newIds = [...selectedIds, account.id];
    }

    onChange({ accountIds: newIds, selectedPages: newPages });
  };

  // ── Toggle expand panel ─────────────────────────────────────────────────────
  const toggleExpand = (accountId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Empty ───────────────────────────────────────────────────────────────────
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
      {/* Select All */}
      <button
        type="button"
        onClick={handleSelectAll}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        {allSelected ? 'Deselect All' : 'Select All'}
      </button>

      {/* Account list */}
      <div className="space-y-2">
        {accounts.map((account) => {
          const isSelected  = selectedIds.includes(account.id);
          const hasPages    = isPagePlatform(account);
          const isExpanded  = !!expanded[account.id];
          const accPageIds  = selectedPages[account.id] || [];

          return (
            <div key={account.id}>
              {/* ── Account row ── */}
              <div
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl transition-all',
                  hasPages && isExpanded ? 'rounded-b-none' : '',
                  isSelected
                    ? 'bg-indigo-50 border-2 border-indigo-200'
                    : 'bg-slate-50 border-2 border-transparent hover:border-slate-200'
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggleAccount(account)}
                  className="data-[state=checked]:bg-indigo-600 flex-shrink-0"
                />

                {/* Avatar */}
                <div
                  className="relative flex-shrink-0 cursor-pointer"
                  onClick={() => handleToggleAccount(account)}
                >
                  <img
                    src={account.profilePicture}
                    alt={account.accountName}
                    className="w-9 h-9 rounded-full object-cover"
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(account.accountName)}&size=36`;
                    }}
                  />
                  <div className="absolute -bottom-1 -right-1">
                    <PlatformIcon platform={account.platform} size="sm" />
                  </div>
                </div>

                {/* Name + platform */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleToggleAccount(account)}
                >
                  <p className="font-medium text-slate-900 truncate">
                    {account.accountName}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">
                    {account.platform.replace('_', ' ')}
                    {hasPages && (
                      <span className="ml-1 text-slate-400">
                        · {account.pages.length} page{account.pages.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>

                {/* Check or page count badge */}
                {isSelected && !hasPages && (
                  <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                )}
                {isSelected && hasPages && accPageIds.length > 0 && (
                  <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    {accPageIds.length}/{account.pages.length}
                  </span>
                )}

                {/* Expand chevron */}
                {hasPages && (
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(account.id, e)}
                    className="p-1 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 flex-shrink-0"
                    title={isExpanded ? 'Hide pages' : 'Show pages'}
                  >
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />
                    }
                  </button>
                )}
              </div>

              {/* ── Pages panel ── */}
              {hasPages && isExpanded && (
                <div className={cn(
                  'border-2 border-t-0 rounded-b-xl overflow-hidden',
                  isSelected ? 'border-indigo-200' : 'border-slate-200'
                )}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Select pages to post to
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllPages(account)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {account.pages.every((p) => accPageIds.includes(p.pageId))
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>

                  {/* Page rows */}
                  {account.pages.map((page) => {
                    const pageSelected = accPageIds.includes(page.pageId);
                    return (
                      <label
                        key={page.pageId}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                          'border-b border-slate-100 last:border-0',
                          pageSelected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'
                        )}
                      >
                        <Checkbox
                          checked={pageSelected}
                          onCheckedChange={() => handleTogglePage(account, page.pageId)}
                          className="data-[state=checked]:bg-indigo-600 flex-shrink-0"
                        />

                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <PlatformIcon platform={account.platform} size="sm" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {page.pageName}
                          </p>
                          {page.category && (
                            <p className="text-xs text-slate-400 truncate">{page.category}</p>
                          )}
                        </div>

                        {pageSelected && (
                          <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        )}
                      </label>
                    );
                  })}

                  {/* Warning: account selected but 0 pages chosen */}
                  {isSelected && accPageIds.length === 0 && (
                    <div className="px-4 py-2 flex items-center gap-2 bg-amber-50">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-700">
                        Select at least one page to post
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlatformSelector;