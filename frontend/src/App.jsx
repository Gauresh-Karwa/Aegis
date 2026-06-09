import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import ForensicWorkspace from './components/ForensicWorkspace';
import ThreatEngine from './components/ThreatEngine';
import DatabaseView from './components/DatabaseView';

function App() {
    const [currentRoute, setCurrentRoute] = useState('upload'); // 'upload', 'hub', 'database'
    const [applicants, setApplicants] = useState([]);
    const [activeApplicantId, setActiveApplicantId] = useState(null);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Only trigger if we are on landing page and not typing in an input
            if (currentRoute !== 'upload' && currentRoute !== 'hub') return;
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 'f') {
                setCurrentRoute('hub');
            } else if (e.key.toLowerCase() === 'd') {
                setCurrentRoute('database');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentRoute]);

    const handleUpload = async (files) => {
        try {
            setCurrentRoute('hub');
            const newApplicant = {
                id: `TEMP-${Date.now()}`,
                name: files[0]?.webkitRelativePath.split('/')[0] || 'Unknown Folder',
                status: 'processing',
                data: null
            };
            setApplicants(prev => [...prev, newApplicant]);
            setActiveApplicantId(newApplicant.id);

            const formData = new FormData();
            Array.from(files).forEach(file => {
                formData.append('files', file);
            });

            const response = await axios.post('http://127.0.0.1:8000/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setApplicants(prev => prev.map(app => 
                app.id === newApplicant.id 
                ? { ...app, status: 'done', data: response.data }
                : app
            ));
        } catch (error) {
            console.error("Upload failed:", error);
            setApplicants(prev => prev.map(app => 
                app.status === 'processing' 
                ? { ...app, status: 'error' } 
                : app
            ));
        }
    };

    const activeApplicant = applicants.find(a => a.id === activeApplicantId)?.data;

    return (
    <div className="w-full h-screen flex flex-col bg-[#ffffff] text-[#111111] overflow-hidden">
        {/* ROW 1 */}
        <Header currentRoute={currentRoute} setCurrentRoute={setCurrentRoute} />
        
        {/* ROW 2 & 3 */}
        {currentRoute === 'database' && (
            <div className="flex-1 overflow-hidden bg-[#fafafa]">
                <DatabaseView />
            </div>
        )}

        {(currentRoute === 'upload' || (currentRoute === 'hub' && !activeApplicantId)) && (
            <LandingPage onUpload={handleUpload} />
        )}

        {currentRoute === 'hub' && activeApplicantId && (
            <div className="flex-1 flex overflow-hidden">
                {/* LEFT PANEL: Application Queue */}
                <div className="w-[260px] bg-[#fafafa] border-r border-[#e5e7eb] h-full flex flex-col shrink-0">
                    <div className="h-[36px] px-4 border-b border-[#e5e7eb] flex justify-between items-center bg-[#fafafa]">
                        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#111111', letterSpacing: '0.1em' }}>APPLICATION QUEUE</div>
                        <button onClick={() => setCurrentRoute('upload')} style={{ fontSize: '16px', fontWeight: 'bold', color: '#111111' }}>+</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {applicants.map(app => (
                            <div 
                                key={app.id} 
                                onClick={() => app.status === 'done' && setActiveApplicantId(app.id)}
                                className={`p-2 border bg-[#ffffff] cursor-pointer transition-colors relative ${activeApplicantId === app.id ? 'border-[#111111]' : 'border-[#e5e7eb] hover:border-[#9ca3af]'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600, color: '#111111' }} className="truncate pr-6">{app.name}</div>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setApplicants(prev => prev.filter(a => a.id !== app.id));
                                            if (activeApplicantId === app.id) setActiveApplicantId(null);
                                        }}
                                        style={{ color: '#9ca3af' }} className="hover:text-[#991b1b]"
                                        title="Remove Application"
                                    >×</button>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    {app.status === 'processing' && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', color: '#1a3db5' }} className="animate-pulse uppercase font-semibold">Processing...</span>}
                                    {app.status === 'error' && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '10px', color: '#991b1b' }} className="uppercase font-semibold">Error</span>}
                                    {app.status === 'done' && app.data && (
                                        <span style={{ 
                                            fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', padding: '2px 4px',
                                            backgroundColor: (app.data.risk_level === 'CRITICAL' || app.data.risk_level === 'HIGH') ? '#991b1b' : '#1a3db5',
                                            color: '#ffffff'
                                        }}>
                                            {app.data.risk_level}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CENTER PANEL: Forensic Workspace */}
                <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#ffffff]">
                    {activeApplicant ? (
                        <ForensicWorkspace backendData={activeApplicant} />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-[#9ca3af]" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
                            Processing document data...
                        </div>
                    )}
                </div>

                {/* RIGHT PANEL: Threat Engine */}
                <div className="w-[320px] bg-[#fafafa] border-l border-[#e5e7eb] h-full shrink-0 overflow-y-auto">
                    {activeApplicant && <ThreatEngine backendData={activeApplicant} />}
                </div>
            </div>
        )}
    </div>
    );
}

export default App;
