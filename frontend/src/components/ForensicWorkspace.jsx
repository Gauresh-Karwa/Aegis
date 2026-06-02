import React from 'react';
import DocumentConsistency from './DocumentConsistency';
import ApplicantHistory from './ApplicantHistory';
import RelationshipGraph from './RelationshipGraph';
import ComplianceAudit from './ComplianceAudit';
import DocumentViewer from './DocumentViewer';

const ForensicWorkspace = ({ currentView, backendData, fileUrl }) => {
  return (
    <div className="w-full flex flex-col h-full bg-enterprise-900">
      {/* Top Split: Document Viewer (Optional overlay look) */}
      <div className="w-full h-[400px] border-b border-white/5 bg-black/50 relative p-4 overflow-hidden rounded-none">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 absolute top-2 left-4 z-20">Live Document Stream</h3>
        <div className="w-full h-full relative z-10 pt-4">
           <DocumentViewer fileUrl={fileUrl} />
        </div>
        {/* Overlay Graphic */}
        <div className="absolute top-4 right-4 z-20 bg-enterprise-900/80 border border-white/10 px-3 py-1.5 text-[10px] uppercase font-mono text-verification-green">
           Cross-Reference Tool: Active
        </div>
      </div>

      {/* Bottom Split: The Analytical Views */}
      <div className="flex-1 p-6 overflow-y-auto">
        {currentView === 'consistency' && <DocumentConsistency backendData={backendData} />}
        {currentView === 'history' && <ApplicantHistory backendData={backendData} />}
        {currentView === 'network' && <RelationshipGraph backendData={backendData} />}
        {currentView === 'compliance' && <ComplianceAudit backendData={backendData} />}
      </div>
    </div>
  );
};

export default ForensicWorkspace;
