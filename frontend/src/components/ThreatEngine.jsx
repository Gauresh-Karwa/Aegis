import React from 'react';

const ThreatEngine = ({ backendData }) => {
  const flags = backendData?.all_flags || [];

  return (
    <div className="w-[350px] bg-enterprise-900 border-l border-white/5 h-full flex flex-col fixed right-0 top-16 pt-6 z-10 overflow-y-auto hidden lg:flex rounded-none">
      <div className="px-6 flex flex-col h-full">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-white/5 pb-2">
          Threat Engine
        </h2>

        {/* Anomaly Stream */}
        <div className="flex-1">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Live Anomaly Stream</h3>
          <div className="space-y-3">
            {flags.length > 0 ? (
              flags.map((flag, idx) => (
                <div key={idx} className="bg-action-orange/10 border border-action-orange/30 p-3 rounded-none relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-action-orange"></div>
                  <div className="text-[10px] font-mono text-action-orange mb-1 uppercase">ALERT TRIGGERED</div>
                  <div className="text-xs text-white">{flag}</div>
                </div>
              ))
            ) : (
              <div className="bg-verification-green/10 border border-verification-green/30 p-3 rounded-none relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-verification-green"></div>
                <div className="text-[10px] font-mono text-verification-green mb-1 uppercase">SYSTEM CLEAR</div>
                <div className="text-xs text-white">No active anomalies detected in current stream.</div>
              </div>
            )}
            
            {/* Synthetic Alert Mock for Demo if not flagged by backend */}
            <div className="bg-white/5 border border-white/10 p-3 rounded-none relative">
              <div className="text-[10px] font-mono text-slate-400 mb-1 uppercase">DEVICE INTELLIGENCE</div>
              <div className="text-xs text-slate-300">
                Device Fingerprint matches 1 prior application (Status: Normal).
              </div>
            </div>
            
             <div className="bg-white/5 border border-white/10 p-3 rounded-none relative">
              <div className="text-[10px] font-mono text-slate-400 mb-1 uppercase">LLM INSIGHTS</div>
              <div className="text-xs text-slate-300">
                {backendData?.llm_insights?.extracted_text_summary?.substring(0, 100)}...
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="mt-8 border-t border-white/5 pt-6 pb-24">
           <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Underwriter Action Panel</h3>
           <div className="space-y-3">
              <button className="w-full bg-verification-green/10 border border-verification-green/50 text-verification-green hover:bg-verification-green hover:text-white transition-colors py-3 text-xs font-bold uppercase tracking-widest rounded-none">
                APPROVE DOCUMENT
              </button>
              <button className="w-full bg-blue-500/10 border border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white transition-colors py-3 text-xs font-bold uppercase tracking-widest rounded-none">
                ESCALATE TO L2
              </button>
              <button className="w-full bg-action-orange/10 border border-action-orange/50 text-action-orange hover:bg-action-orange hover:text-white transition-colors py-3 text-xs font-bold uppercase tracking-widest rounded-none">
                FLAG AS FRAUD
              </button>
           </div>
           <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-widest text-center">
             Audit Trail: Logs recorded under User ID 4492
           </div>
        </div>
      </div>
    </div>
  );
};

export default ThreatEngine;
