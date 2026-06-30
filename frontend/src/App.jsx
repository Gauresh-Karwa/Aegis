import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import ForensicWorkspace from './components/ForensicWorkspace';
import ForensicNavigator from './components/ForensicNavigator';
import ThreatEngine from './components/ThreatEngine';
import DatabaseView from './components/DatabaseView';
import ApplicantHistorySidebar from './components/ApplicantHistorySidebar';

function App() {
    const [currentRoute, setCurrentRoute] = useState('upload'); // 'upload', 'hub', 'database'
    const [applicants, setApplicants] = useState([]);
    const [activeApplicantId, setActiveApplicantId] = useState(null);
    const [showHistorySidebar, setShowHistorySidebar] = useState(false);
    const [activeModule, setActiveModule] = useState('Document Viewer');

    // Lifted state for Forensic Overlays panel
    const [activeDocType, setActiveDocType] = useState('');
    const [toggles, setToggles] = useState({
        ela: true,
        noise: true,
        copyMove: true,
        font: true,
        ocr: true
    });

    useEffect(() => {
        const activeApplicant = applicants.find(a => a.id === activeApplicantId)?.data;
        if (activeApplicant && activeApplicant.documents && activeApplicant.documents.length > 0) {
            setActiveDocType(activeApplicant.documents[0].type);
        } else {
            setActiveDocType('');
        }
    }, [activeApplicantId, applicants]);

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
        <Header 
            currentRoute={currentRoute} 
            setCurrentRoute={setCurrentRoute} 
            applicantName={activeApplicant?.applicant_name || activeApplicant?.manifest_data?.name || activeApplicant?.name}
            applicantId={activeApplicantId}
            onViewHistory={() => setShowHistorySidebar(prev => !prev)}
        />
        
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

                {/* PANEL 1 LEFT — Single sidebar 220px: Application Queue (top) + Forensic Modules (bottom) */}
                <div style={{ width: '220px', flexShrink: 0 }} className="bg-[#fafafa] border-r border-[#e5e7eb] h-full flex flex-col">

                    {/* Top half: Application Queue */}
                    <div className="flex flex-col" style={{ flex: '0 0 auto', maxHeight: '50%', minHeight: '120px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div className="h-[36px] px-4 border-b border-[#e5e7eb] flex justify-between items-center bg-[#fafafa] shrink-0">
                            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#111111', letterSpacing: '0.1em' }}>APPLICATION QUEUE</div>
                            <button onClick={() => setCurrentRoute('upload')} style={{ fontSize: '16px', fontWeight: 'bold', color: '#111111' }}>+</button>
                        </div>
                        <div className="overflow-y-auto p-3 space-y-2" style={{ flex: 1 }}>
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

                    {/* Thin divider between the two sections */}
                    <div style={{ height: '1px', backgroundColor: '#e5e7eb', flexShrink: 0 }} />

                    {/* Bottom half: Forensic Modules list */}
                    <div className="flex flex-col" style={{ flex: 1, overflow: 'hidden' }}>
                        {activeApplicant ? (
                            <ForensicNavigator
                                backendData={activeApplicant}
                                activeModule={activeModule}
                                setActiveModule={setActiveModule}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-[#9ca3af]" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}>
                                No Analysis Active
                            </div>
                        )}
                    </div>
                </div>

                {/* PANEL 2 CENTER — Active module content only, full height */}
                <div className="flex-1 h-full overflow-hidden bg-[#ffffff]">
                    {applicants.find(a => a.id === activeApplicantId)?.status === 'error' ? (
                        <div className="flex-1 h-full flex flex-col items-center justify-center text-[#991b1b] p-6 gap-2 text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
                            <div className="font-bold text-[14px]"> ASSEMBLY OR PIPELINE FAILURE</div>
                            <div className="max-w-[400px] text-[#7f1d1d] mt-1 font-sans">
                                {applicants.find(a => a.id === activeApplicantId)?.errorMessage || "Invalid folder structure or unsupported file format."}
                            </div>
                        </div>
                    ) : activeApplicant ? (
                        <ForensicWorkspace
                            backendData={activeApplicant}
                            activeModule={activeModule}
                            setActiveModule={setActiveModule}
                            activeDocType={activeDocType}
                            setActiveDocType={setActiveDocType}
                            toggles={toggles}
                        />
                    ) : (
                        <div className="flex-1 h-full flex items-center justify-center text-[#9ca3af]" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>
                            Processing document data...
                        </div>
                    )}
                </div>

                {/* PANEL 3 RIGHT — 2 sections: Forensic Overlays / Threat Analysis */}
                <div style={{ width: '320px', flexShrink: 0 }} className="bg-[#fafafa] border-l border-[#e5e7eb] h-full flex flex-col overflow-hidden">
                    
                    {/* ── SECTION 2: FORENSIC OVERLAYS ── */}
                    <div className="shrink-0 border-b-2 border-[#111111] bg-white">
                        {/* Section Header */}
                        <div className="h-[34px] px-4 flex items-center justify-between bg-[#111111] shrink-0">
                            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: '10px', color: '#ffffff', letterSpacing: '0.12em' }}>
                                FORENSIC OVERLAYS
                            </div>
                            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#6b7280', letterSpacing: '0.05em' }}>
                                {activeDocType ? activeDocType.toUpperCase() : '—'}
                            </div>
                        </div>
                        {/* Toggle Grid */}
                        <div className="px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-2 bg-white">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={toggles.ela} onChange={e => setToggles(t => ({ ...t, ela: e.target.checked }))} className="shrink-0" />
                                <div className="text-[10px] font-semibold text-[#111] flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
                                    ELA Heatmap
                                </div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={toggles.noise} onChange={e => setToggles(t => ({ ...t, noise: e.target.checked }))} className="shrink-0" />
                                <div className="text-[10px] font-semibold text-[#111] flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0" />
                                    Noise Residual
                                </div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={toggles.copyMove} onChange={e => setToggles(t => ({ ...t, copyMove: e.target.checked }))} className="shrink-0" />
                                <div className="text-[10px] font-semibold text-[#111] flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#3b82f6] shrink-0" />
                                    Copy-Move
                                </div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={toggles.font} onChange={e => setToggles(t => ({ ...t, font: e.target.checked }))} className="shrink-0" />
                                <div className="text-[10px] font-semibold text-[#111] flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0" />
                                    Font Anomaly
                                </div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={toggles.ocr} onChange={e => setToggles(t => ({ ...t, ocr: e.target.checked }))} className="shrink-0" />
                                <div className="text-[10px] font-semibold text-[#111] flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#f59e0b] bg-opacity-40 border border-[#f59e0b] shrink-0" />
                                    OCR Confidence
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* ── SECTION 3: THREAT ANALYSIS ── */}
                    <div className="overflow-y-auto flex-1 bg-white">
                        {activeApplicant && <ThreatEngine backendData={activeApplicant} />}
                    </div>
                </div>

            </div>
        )}

        {/* PAN History Sidebar */}
        {showHistorySidebar && activeApplicant && (
            <ApplicantHistorySidebar 
                pan={activeApplicant.pan || activeApplicant.manifest_data?.pan || activeApplicant.entities_by_doc?.identity?.find(e => e.label === 'pan')?.text}
                applicantName={activeApplicant.applicant_name || activeApplicant.manifest_data?.name || activeApplicant.name}
                currentRiskLevel={activeApplicant.risk_level}
                onClose={() => setShowHistorySidebar(false)}
            />
        )}
    </div>
    );
}

export default App;
