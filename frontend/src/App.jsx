import { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ApplicationTimeline from './components/ApplicationTimeline';
import ForensicWorkspace from './components/ForensicWorkspace';
import ThreatEngine from './components/ThreatEngine';
import DatabaseView from './components/DatabaseView';

function App() {
  const [applicants, setApplicants] = useState([]);
  const [activeApplicantId, setActiveApplicantId] = useState(null);
  const [currentView, setCurrentView] = useState('consistency');

  const activeApplicant = applicants.find(a => a.id === activeApplicantId)?.data;

  const handleUpload = async (files) => {
    // Generate temporary ID
    const tempId = 'tmp_' + Date.now();
    const newApplicant = {
        id: tempId,
        name: files[0]?.name.split('.')[0] || 'Unknown Folder',
        status: 'processing',
        data: null
    };
    
    setApplicants(prev => [newApplicant, ...prev]);
    setActiveApplicantId(tempId);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await axios.post('http://127.0.0.1:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setApplicants(prev => prev.map(a => 
          a.id === tempId ? { ...a, id: response.data.applicant_id, status: 'done', data: response.data, name: response.data.applicant_id } : a
      ));
      setActiveApplicantId(response.data.applicant_id);

    } catch (err) {
      console.error(err);
      setApplicants(prev => prev.map(a => 
          a.id === tempId ? { ...a, status: 'error' } : a
      ));
    }
  };

  const handleBatchRun = async () => {
      try {
          await axios.post('http://127.0.0.1:8000/batch');
          alert("Batch process initiated.");
      } catch (err) {
          console.error(err);
      }
  };

  return (
    <div className="relative min-h-screen text-brand-navy overflow-hidden font-sans bg-brand-slate">
      <main className="w-full h-screen flex">
        
        {/* LEFT PANEL: Application Queue */}
        <div className="w-[240px] bg-white border-r border-black h-full flex flex-col shrink-0">
            <div className="p-4 border-b border-black">
                <div className="text-xs font-bold uppercase tracking-widest mb-4">Application Queue</div>
                <UploadZone onUpload={handleUpload} compact={true} />
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {applicants.map(app => (
                    <div 
                        key={app.id} 
                        onClick={() => app.status === 'done' && setActiveApplicantId(app.id)}
                        className={`p-3 border border-black cursor-pointer transition-colors ${activeApplicantId === app.id ? 'bg-brand-slate' : 'hover:bg-gray-50'}`}
                    >
                        <div className="text-xs font-mono font-bold truncate">{app.name}</div>
                        <div className="flex justify-between items-center mt-2">
                            {app.status === 'processing' && <span className="text-[10px] text-blue-600 animate-pulse uppercase">Processing...</span>}
                            {app.status === 'error' && <span className="text-[10px] text-red-600 uppercase">Error</span>}
                            {app.status === 'done' && (
                                <span className={`text-[10px] font-bold px-2 py-1 uppercase text-black ${
                                    app.data.risk_level === 'CRITICAL' ? 'bg-[#FF0000]' : 
                                    app.data.risk_level === 'HIGH' ? 'bg-[#FF6B35]' : 
                                    app.data.risk_level === 'MEDIUM' ? 'bg-[#FFB800]' : 'bg-[#00FF88]'
                                }`}>
                                    {app.data.risk_level}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-black">
                <button onClick={handleBatchRun} className="w-full bg-black text-white text-xs font-mono font-bold uppercase py-2 hover:bg-gray-800">
                    Run Batch
                </button>
            </div>
        </div>

        {/* CENTER PANEL: Forensic Workspace */}
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-brand-slate">
            {activeApplicant ? (
                <ForensicWorkspace backendData={activeApplicant} />
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 font-mono text-sm">
                    Select an applicant from the queue to view forensic analysis.
                </div>
            )}
        </div>

        {/* RIGHT PANEL: Threat Engine */}
        {activeApplicant && (
            <div className="w-[320px] bg-white border-l border-black h-full shrink-0">
                <ThreatEngine backendData={activeApplicant} />
            </div>
        )}

      </main>
    </div>
  );
}

export default App;
