import React, { useState } from 'react';
import axios from 'axios';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ForensicWorkspace from './components/ForensicWorkspace';
import ThreatEngine from './components/ThreatEngine';
import DatabaseView from './components/DatabaseView';

function App() {
  const [applicants, setApplicants] = useState([]);
  const [activeApplicantId, setActiveApplicantId] = useState(null);
  const [currentRoute, setCurrentRoute] = useState('upload'); // 'upload', 'hub', 'database'

  const activeApplicant = applicants.find(a => a.id === activeApplicantId)?.data;

  const handleUpload = async (files) => {
    const tempId = 'tmp_' + Date.now();
    const newApplicant = {
        id: tempId,
        name: files[0]?.name.split('.')[0] || 'Unknown Folder',
        status: 'processing',
        data: null
    };
    
    setApplicants(prev => [newApplicant, ...prev]);
    setActiveApplicantId(tempId);
    setCurrentRoute('hub');

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

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f5f5f5] text-black">
      <Header currentRoute={currentRoute} setCurrentRoute={setCurrentRoute} />
      
      <main className="flex-1 flex overflow-hidden">
        
        {currentRoute === 'database' && (
            <DatabaseView />
        )}

        {(currentRoute === 'upload' || (currentRoute === 'hub' && !activeApplicantId)) && (
            <div className="w-full h-full flex flex-col items-center justify-center">
                <div style={{ fontSize: '96px', fontWeight: 'bold', color: '#000000', lineHeight: 1 }}>
                    AEGIS
                </div>
                <div style={{ marginTop: '16px', fontSize: '18px', fontWeight: 400, color: '#111111' }}>
                    Fraud Detection <span style={{ color: '#aaa', margin: '0 8px' }}>|</span> Loan Document Verification <span style={{ color: '#aaa', margin: '0 8px' }}>|</span> Anti-Financial Crime
                </div>
                <div style={{ marginTop: '24px' }}>
                    <UploadZone onUpload={handleUpload} />
                </div>
            </div>
        )}

        {currentRoute === 'hub' && activeApplicantId && (
            <div className="w-full h-full flex">
                {/* LEFT PANEL: Application Queue */}
                <div className="w-[240px] bg-white border-r border-[#ddd] h-full flex flex-col shrink-0">
                    <div className="p-4 border-b border-[#ddd] flex justify-between items-center bg-[#f5f5f5]">
                        <div className="text-xs font-bold uppercase tracking-widest text-[#111]">Application Queue</div>
                        <button onClick={() => setCurrentRoute('upload')} className="text-xl font-bold text-[#111] hover:text-[#000]">+</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f5f5f5]">
                        {applicants.map(app => (
                            <div 
                                key={app.id} 
                                onClick={() => app.status === 'done' && setActiveApplicantId(app.id)}
                                className={`p-3 border border-[#ddd] bg-white cursor-pointer transition-colors ${activeApplicantId === app.id ? 'border-black border-2' : 'hover:bg-gray-50'}`}
                            >
                                <div className="text-xs font-mono font-bold truncate text-[#111]">{app.name}</div>
                                <div className="flex justify-between items-center mt-2">
                                    {app.status === 'processing' && <span className="text-[10px] text-[#3b82f6] animate-pulse uppercase">Processing...</span>}
                                    {app.status === 'error' && <span className="text-[10px] text-[#FF0000] uppercase">Error</span>}
                                    {app.status === 'done' && app.data && (
                                        <span className={`text-[10px] font-bold px-2 py-1 uppercase text-black ${
                                            app.data.risk_level === 'CRITICAL' ? 'bg-[#FF0000] text-white' : 
                                            app.data.risk_level === 'HIGH' ? 'bg-[#FF6B35] text-white' : 
                                            app.data.risk_level === 'MEDIUM' ? 'bg-[#FFB800]' : 'bg-[#00FF88]'
                                        }`}>
                                            {app.data.risk_level}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CENTER PANEL: Forensic Workspace */}
                <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#f5f5f5]">
                    {activeApplicant ? (
                        <ForensicWorkspace backendData={activeApplicant} />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-[#444] font-mono text-sm">
                            Processing document data...
                        </div>
                    )}
                </div>

                {/* RIGHT PANEL: Threat Engine */}
                {activeApplicant && (
                    <div className="w-[320px] bg-white border-l border-[#ddd] h-full shrink-0">
                        <ThreatEngine backendData={activeApplicant} />
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
