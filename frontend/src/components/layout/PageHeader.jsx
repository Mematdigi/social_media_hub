import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Presentational page header used across all app pages.
 * Purely visual — receives everything via props, holds no state.
 *
 *  icon       lucide icon component
 *  title      page title
 *  subtitle   supporting line
 *  onBack     optional back handler (renders a back button)
 *  backTestId optional data-testid for the back button
 *  actions    optional right-hand content (buttons, toggles…)
 */
export const PageHeader = ({ icon: Icon, title, subtitle, onBack, backTestId, actions, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    className={cn('mb-6 sm:mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between', className)}
  >
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      {onBack && (
        <button
          type="button"
          data-testid={backTestId}
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-slate-900 hover:border-slate-300 transition-colors"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
      )}
      {Icon && (
        <div className="sh-page-icon">
          <Icon />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-[1.375rem] sm:text-[1.75rem] leading-tight font-heading font-bold text-slate-900 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm sm:text-[0.9375rem] text-slate-500 truncate">{subtitle}</p>
        )}
      </div>
    </div>

    {actions && (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
        {actions}
      </div>
    )}
  </motion.div>
);

export default PageHeader;
