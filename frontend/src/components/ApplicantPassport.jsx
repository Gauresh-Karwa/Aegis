import React from 'react';

const ApplicantPassport = ({ backendData }) => {
  const extractedName = backendData?.llm_insights?.key_entities?.Name || "Rajesh Kumar";
  const docType = backendData?.document_type || "Unknown Document";

  return (
    <div className="w-[300px] bg-enterprise-900 border-r border-white/5 h-full flex flex-col fixed left-0 top-16 pt-6 z-10 overflow-y-auto hidden lg:flex rounded-none">
      <div className="px-6 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Applicant Passport</h2>
        
        {/* Placeholder Photo & Basic Info */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 bg-enterprise-800 border border-white/10 flex items-center justify-center text-slate-500 rounded-none overflow-hidden relative">
             <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,#fff_2px,#fff_4px)]"></div>
             <span className="relative z-10 text-xs font-bold">PHOTO</span>
          </div>
          <div>
            <div className="font-bold text-white tracking-wide text-sm">{extractedName}</div>
            <div className="text-xs text-slate-400 mt-1 uppercase">ID: AP-992-811</div>
            <div className={`text-[10px] font-bold uppercase tracking-widest mt-2 px-2 py-0.5 inline-block ${backendData?.overall_risk_score > 50 ? 'bg-action-orange/20 text-action-orange' : 'bg-verification-green/20 text-verification-green'}`}>
              Risk: {backendData?.risk_band}
            </div>
          </div>
        </div>

        {/* Verification Status */}
        <div className="space-y-3 border-t border-white/5 pt-4">
           <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">PAN Status</span>
              <span className="text-verification-green font-bold flex items-center gap-1">VERIFIED</span>
           </div>
           <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Aadhaar Auth</span>
              <span className="text-verification-green font-bold flex items-center gap-1">VERIFIED</span>
           </div>
           <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Document Type</span>
              <span className="text-blue-400 font-bold font-mono">{docType}</span>
           </div>
        </div>

        {/* Financial DNA Sparkline */}
        <div className="mt-8 border-t border-white/5 pt-4">
           <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Financial DNA (2 Yr Trend)</h3>
           <div className="h-20 w-full relative border-b border-l border-white/10 flex items-end">
              <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0,80 L20,75 L40,60 L60,65 L80,30 L100,20" fill="none" stroke="#38bdf8" strokeWidth="2" />
                <path d="M0,100 L0,80 L20,75 L40,60 L60,65 L80,30 L100,20 L100,100 Z" fill="rgba(56, 189, 248, 0.1)" />
              </svg>
           </div>
           <div className="flex justify-between text-[8px] text-slate-500 uppercase mt-1 font-mono">
              <span>May '24</span>
              <span>May '26</span>
           </div>
           <div className="text-xs text-slate-400 mt-3 p-2 bg-white/5 border-l-2 border-blue-500 rounded-none">
             <span className="font-bold text-white">Delta:</span> Income increased 20% compared to previous submission. Within normal limits.
           </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicantPassport;
