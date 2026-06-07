import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Header = ({ currentView, setCurrentView, currentRoute, setCurrentRoute, hasDocument }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="w-full pointer-events-auto flex justify-between items-center py-4 px-8 absolute top-0 left-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="flex items-center gap-6">
        <div 
          className="flex flex-col justify-center cursor-pointer"
          onClick={() => setCurrentRoute('upload')}
        >
          <div className="text-base font-bold font-sans tracking-tight text-brand-navy leading-none">AEGIS</div>
          <div className="text-[10px] uppercase tracking-widest text-brand-gray mt-0.5 flex items-center gap-1">
            Canara Bank
          </div>
        </div>
        
        {/* Main Navigation */}
        <div className="hidden md:flex items-center gap-4 ml-8 border-l border-slate-200 pl-8">
           <button 
             onClick={() => hasDocument ? setCurrentRoute('hub') : setCurrentRoute('upload')}
             className={`text-xs font-bold uppercase tracking-widest transition-colors ${currentRoute === 'hub' || currentRoute === 'upload' ? 'text-brand-blue' : 'text-slate-500 hover:text-brand-navy'}`}
           >
             Forensic Hub
           </button>
           <button 
             onClick={() => setCurrentRoute('database')}
             className={`text-xs font-bold uppercase tracking-widest transition-colors ${currentRoute === 'database' ? 'text-brand-blue' : 'text-slate-500 hover:text-brand-navy'}`}
           >
             Database
           </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4 relative">
        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">
           <div className="w-1.5 h-1.5 bg-emerald-500 animate-pulse rounded-full"></div>
           System Online
        </div>
        
        {hasDocument && currentRoute === 'hub' && (
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-300 hover:text-white transition-colors relative z-50 p-1 text-xs font-bold uppercase tracking-widest ml-4 bg-white/5 px-4 py-2 border border-white/10"
          >
             {menuOpen ? "CLOSE" : "VIEWS"}
          </button>
        )}

        {/* Dropdown Menu */}
        <AnimatePresence>
          {menuOpen && hasDocument && currentRoute === 'hub' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-12 right-0 w-64 bg-enterprise-800 border border-white/10 rounded-none shadow-xl overflow-hidden py-2"
            >
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Forensic Layers</p>
              </div>
              <button onClick={() => { setCurrentView('consistency'); setMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-verification-green transition-colors rounded-none">
                L2: Visual Forensics
              </button>
              <button onClick={() => { setCurrentView('history'); setMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-verification-green transition-colors rounded-none">
                L5: Behavioural Profile
              </button>
              <button onClick={() => { setCurrentView('network'); setMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-verification-green transition-colors rounded-none">
                L7: Fraud Network Graph
              </button>
              <button onClick={() => { setCurrentView('compliance'); setMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-verification-green transition-colors rounded-none">
                L8: Audit & Compliance
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default Header;
