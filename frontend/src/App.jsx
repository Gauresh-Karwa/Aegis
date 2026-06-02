import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ApplicantPassport from './components/ApplicantPassport';
import ForensicWorkspace from './components/ForensicWorkspace';
import ThreatEngine from './components/ThreatEngine';
import DatabaseView from './components/DatabaseView';

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [currentView, setCurrentView] = useState('consistency');
  const [currentRoute, setCurrentRoute] = useState('upload'); // 'upload', 'hub', 'database'

  const handleUpload = async (file) => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    setFileUrl(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTimeout(() => {
        setResult(response.data);
        setLoading(false);
        setCurrentRoute('hub');
      }, 500); 
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An error occurred during analysis. Falling back to LLM Mode.");
      setLoading(false);
    }
  };

  const resetState = () => {
    setResult(null);
    setFileUrl(null);
    setError(null);
    setCurrentRoute('upload');
  };

  return (
    <div className="relative min-h-screen text-slate-200 overflow-hidden font-sans bg-enterprise-900">
      <Header 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        currentRoute={currentRoute}
        setCurrentRoute={setCurrentRoute}
        hasDocument={!!result || !!fileUrl} 
      />

      <main className="w-full h-screen pt-16">
        
        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-action-orange/10 border-b border-action-orange/50 text-action-orange p-3 flex items-center justify-center gap-3 absolute top-16 w-full z-50 rounded-none"
            >
              <div className="font-medium text-sm">WARNING: {error}</div>
              <button onClick={() => setError(null)} className="text-slate-300 hover:text-white underline text-sm ml-4">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- STARTING WEBSITE (Landing Page Mode) --- */}
        {currentRoute === 'upload' && !loading && (
          <div className="w-full h-full overflow-y-auto">
            <div className="w-full pt-32 pb-24 px-6 relative flex flex-col items-center border-b border-white/5 data-grid">
              <div className="max-w-4xl mx-auto text-center mb-12 relative z-10">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
                  Customer Intelligence Hub for <br />
                  <span className="text-verification-green">Anti-Financial Crime</span>
                </h1>
                <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
                  Manage fraud risk with AI-powered document forensics, structural template matching, and behavioral profile intelligence.
                </p>
              </div>

              <div className="w-full max-w-3xl relative z-10">
                <UploadZone onUpload={handleUpload} />
              </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="feature-card">
                <h3 className="text-lg font-bold text-white mb-2">Layer 2: Visual Forensics</h3>
                <ul className="text-sm text-slate-400 space-y-2 mb-6 list-disc list-inside">
                  <li>Error Level Analysis (ELA)</li>
                  <li>Metadata & Font Consistency</li>
                  <li>Structural Template Matching</li>
                </ul>
              </div>
              <div className="feature-card">
                <h3 className="text-lg font-bold text-white mb-2">Layer 5: Behavioural DNA</h3>
                <ul className="text-sm text-slate-400 space-y-2 mb-6 list-disc list-inside">
                  <li>Historical Baseline Comparison</li>
                  <li>Income Spike & Ghost Employer Detection</li>
                  <li>Cross-Applicant Fraud Ring Detection</li>
                </ul>
              </div>
              <div className="feature-card">
                <h3 className="text-lg font-bold text-white mb-2">Layer 8: Audit & Compliance</h3>
                <ul className="text-sm text-slate-400 space-y-2 mb-6 list-disc list-inside">
                  <li>Tamper-proof Cryptographic Logs</li>
                  <li>Traceable Underwriter Action Trail</li>
                  <li>RBI Statutory Reporting Export</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* --- LOADING OVERLAY --- */}
        {loading && (
          <div className="absolute inset-0 bg-enterprise-900/90 z-40 flex flex-col items-center justify-center pt-16">
             <div className="w-16 h-16 border-4 border-verification-green/30 border-t-verification-green rounded-full animate-spin mb-6"></div>
             <div className="text-sm font-bold uppercase tracking-widest text-slate-300 animate-pulse">Running 8-Layer Neural Pipeline...</div>
          </div>
        )}

        {/* --- 3-ZONE INTELLIGENCE HUB --- */}
        {currentRoute === 'hub' && (result || fileUrl) && !loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex"
          >
            {/* Zone 1: Applicant Passport */}
            <ApplicantPassport backendData={result} />

            {/* Zone 2: Forensic Workspace */}
            <div className="flex-1 lg:ml-[300px] lg:mr-[350px] h-full overflow-hidden flex flex-col relative bg-enterprise-900">
               {/* Top Context Bar */}
               <div className="flex justify-between items-center bg-enterprise-800 p-4 border-b border-white/5 shadow-sm shrink-0">
                 <div className="flex items-center gap-4">
                    <button onClick={resetState} className="px-4 py-1 text-xs font-bold uppercase tracking-widest bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-none">
                       ← BACK
                    </button>
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Application Context</div>
                      <div className="text-sm font-semibold text-white">
                        {result ? result.filename : 'Analyzing Submissions...'}
                      </div>
                    </div>
                 </div>
                 {result && (
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Final Determination (Layer 6)</div>
                    <div className={`text-sm font-bold ${result.overall_risk_score >= 70 ? 'text-action-orange' : 'text-verification-green'} uppercase`}>
                      {result.risk_band} RISK EXPOSURE
                    </div>
                  </div>
                 )}
               </div>

               {/* Workspace Content */}
               <div className="flex-1 overflow-hidden">
                  <ForensicWorkspace currentView={currentView} backendData={result} fileUrl={fileUrl} />
               </div>
            </div>

            {/* Zone 3: Threat Engine */}
            <ThreatEngine backendData={result} />

          </motion.div>
        )}

        {/* --- DATABASE VIEW --- */}
        {currentRoute === 'database' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full overflow-y-auto"
          >
            <DatabaseView />
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default App;
