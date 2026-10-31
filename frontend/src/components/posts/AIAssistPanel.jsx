import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ChevronDown } from 'lucide-react';
import { TrendsExplorer } from '../trends/TrendsExplorer';

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible "What's trending" panel at the top of the post form.
// Picking a trend / idea / festival fills the AI suggestions under each field.
// (Writing suggestions themselves now appear inline under the fields.)
// ─────────────────────────────────────────────────────────────────────────────
export const AIAssistPanel = ({ region, niche, onPrefsChange, onWriteFromIdea, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-[1.125rem] border border-orange-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-5 md:p-6 text-left bg-gradient-to-r from-orange-50/80 via-pink-50/50 to-purple-50/50 hover:from-orange-50 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-500 flex items-center justify-center shadow-sm">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-800">What's trending</h3>
          <p className="text-xs text-slate-500 font-medium">Google, YouTube, Instagram, Facebook and upcoming festivals — pick one to write about</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="p-5 md:p-6 border-t border-orange-100">
              <TrendsExplorer
                compact
                createLabel="Write this"
                region={region}
                niche={niche}
                onPrefsChange={onPrefsChange}
                onCreate={(brief, platformHint) => {
                  setOpen(false);
                  onWriteFromIdea(brief, platformHint);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIAssistPanel;
