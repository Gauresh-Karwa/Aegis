import React, { useState, useEffect } from 'react';
import axios from 'axios';
import UploadZone from './UploadZone';

// Custom hook for animated counter
function useCounter(targetValue, duration = 800) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime = null;
        let animationFrame;

        const animate = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            let progress = elapsed / duration;
            if (progress > 1) progress = 1;

            // easeOutCubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(targetValue * easeOut));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            }
        };

        if (targetValue > 0) {
            animationFrame = requestAnimationFrame(animate);
        } else {
            setCount(0);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [targetValue, duration]);

    return count;
}

const LandingPage = ({ onUpload }) => {
    const [time, setTime] = useState("");
    const [feed, setFeed] = useState([
        { time: "--:--:--", msg: "-- AEGIS MMFFN v1.0 LOADED", level: "INFO", id: 1 },
        { time: "--:--:--", msg: "-- NEURAL LAYERS ACTIVE", level: "INFO", id: 2 },
        { time: "--:--:--", msg: "-- META SCALER INITIALISED", level: "INFO", id: 3 },
        { time: "--:--:--", msg: "-- AWAITING FIRST INGESTION", level: "INFO", id: 4 }
    ]);
    const [stats, setStats] = useState({
        folders_analyzed: 0,
        risked_count: 0,
        avg_risk_score: 0,
        model_status: "LOADING",
        last_applicant_id: null,
        last_risk_level: null
    });
    const [uploadStatus, setUploadStatus] = useState('idle');

    // Live Clock
    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toTimeString().slice(0, 8));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch Stats & Feed
    useEffect(() => {
        const fetchData = async () => {
            try {
                const statRes = await axios.get('http://127.0.0.1:8000/stats');
                setStats(statRes.data);
                
                const feedRes = await axios.get('http://127.0.0.1:8000/system/feed');
                if (feedRes.data && feedRes.data.feed) {
                    setFeed(prev => {
                        const newLogs = feedRes.data.feed.map((f, i) => ({ ...f, id: Date.now() + i }));
                        const combined = [...newLogs, ...prev];
                        return combined.slice(0, 20); // Keep max 20
                    });
                }
            } catch (err) {
                console.error("Failed to fetch live data", err);
            }
        };

        // Initial fetch after 1s to allow initial static lines to show
        const initialFetch = setTimeout(fetchData, 1000);
        const interval = setInterval(fetchData, 5000);
        return () => { clearTimeout(initialFetch); clearInterval(interval); };
    }, []);

    const animatedFolders = useCounter(stats.folders_analyzed);
    const animatedRisked = useCounter(stats.risked_count);
    const animatedAvgRisk = useCounter(stats.avg_risk_score * 100);

    const handleLocalUpload = async (files) => {
        setUploadStatus('loading');
        // Let the animation play out for 2.5s before bubbling up
        setTimeout(() => {
            onUpload(files);
        }, 2500);
    };

    return (
        <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-[#ffffff]">
            {/* ROW 2 - Main 3 Columns */}
            <div className="flex-1 flex w-full h-full overflow-hidden">
                
                {/* LEFT COLUMN - System Feed */}
                <div className="w-[260px] shrink-0 h-full bg-[#fafafa] border-r border-[#e5e7eb] flex flex-col overflow-hidden">
                    <div className="h-[36px] shrink-0 border-b border-[#e5e7eb] px-4 flex items-center justify-between">
                        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#111111', letterSpacing: '0.1em' }}>
                            SYSTEM FEED
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1a3db5] animate-pulse-dot"></div>
                    </div>
                    <div className="p-3 flex-1 overflow-hidden relative">
                        {feed.map((item, index) => {
                            const isCritical = item.msg.includes("CRITICAL");
                            const isOldest = index === feed.length - 1 && feed.length === 20;
                            return (
                                <div 
                                    key={item.id} 
                                    className="mb-1"
                                    style={{ 
                                        fontFamily: "'IBM Plex Mono', monospace", 
                                        fontSize: '11px', 
                                        lineHeight: 1.6, 
                                        color: isCritical ? '#991b1b' : '#374151',
                                        opacity: isOldest ? 0 : 1,
                                        transition: 'opacity 0.2s ease',
                                        animation: 'slideDown 0.2s ease-out forwards'
                                    }}
                                >
                                    {item.time} &nbsp;&nbsp; {item.msg}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER COLUMN - Hero + Drop Zone */}
                <div className="flex-1 h-full flex flex-col items-center justify-center bg-[#ffffff] ledger-bg relative">
                    
                    {/* Zone A: Wordmark */}
                    <div className="flex flex-col items-center mb-2 z-10">
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: '64px', color: '#111111', letterSpacing: '0.1em', lineHeight: 1 }}>
                            AEGIS
                        </div>
                        <div className="mt-1.5" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '12px', color: '#9ca3af', letterSpacing: '0.06em' }}>
                            Automated Forensic Intelligence · Multi-Modal Fraud Detection
                        </div>
                        <div className="w-[280px] h-[1px] bg-[#e5e7eb] mx-auto mt-4 mb-0"></div>
                    </div>

                    {/* Zone B: Threat Categories */}
                    <div className="flex w-full max-w-[560px] mb-6 z-10">
                        {[
                            { name: "METADATA POISONING", desc: "PDF producer forged" },
                            { name: "MATH MISMATCH", desc: "Component sum error" },
                            { name: "SEMANTIC DRIFT", desc: "Cross-doc employer name drift" },
                            { name: "VISUAL ARTIFACTS", desc: "Pixel/blur/tilt anomalies" }
                        ].map((cat, i) => (
                            <div key={i} className="flex-1 border border-[#e5e7eb] bg-[#fafafa] p-2.5 hover:border-[#1a3db5] transition-colors duration-150 group cursor-default text-center">
                                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#111111', letterSpacing: '0.1em' }}>
                                    {cat.name}
                                </div>
                                <div className="mt-1 group-hover:text-[#374151] transition-colors duration-150" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '10px', color: '#9ca3af', lineHeight: 1.2 }}>
                                    {cat.desc}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Zone C: Drop Zone */}
                    <div className="z-10 relative">
                        <UploadZone onUpload={handleLocalUpload} status={uploadStatus} />
                        {/* Zone D: Legend */}
                        <div className="mt-4 flex items-center justify-center gap-3">
                            {["Identity Document", "Salary Slip", "ITR Return", "Land Record"].map((item, i) => (
                                <React.Fragment key={item}>
                                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '11px', color: '#9ca3af' }}>{item}</span>
                                    {i < 3 && <span className="inline-block h-[12px] w-[1px] bg-[#e5e7eb]"></span>}
                                </React.Fragment>
                            ))}
                        </div>
                        {uploadStatus === 'idle' && (
                            <div className="absolute -bottom-8 left-0 right-0 text-center pointer-events-none" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '10px', color: '#d1d5db' }}>
                                Press F to open Forensic view
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN - Session Intelligence */}
                <div className="w-[260px] shrink-0 h-full bg-[#fafafa] border-l border-[#e5e7eb] flex flex-col overflow-hidden">
                    <div className="h-[36px] shrink-0 border-b border-[#e5e7eb] px-4 flex items-center">
                        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#111111', letterSpacing: '0.1em' }}>
                            SESSION STATS
                        </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col">
                        {[
                            { val: stats.folders_analyzed === 0 ? "0" : animatedFolders, label: "FOLDERS ANALYSED" },
                            { val: stats.folders_analyzed === 0 ? "0" : animatedRisked, label: "HIGH RISK DETECTED" },
                            { val: stats.folders_analyzed === 0 ? "—" : animatedAvgRisk.toFixed(1), label: "AVG RISK SCORE" }
                        ].map((stat, i) => (
                            <div key={i} className="p-4 border-b border-[#e5e7eb] flex flex-col justify-center">
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: '32px', color: '#111111', lineHeight: 1 }}>
                                    {stat.val}
                                </div>
                                <div className="mt-0.5" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '10px', color: '#9ca3af', letterSpacing: '0.08em' }}>
                                    {stat.label}
                                </div>
                            </div>
                        ))}

                        <div className="p-4 border-b border-[#e5e7eb] flex flex-col justify-center">
                            <div className="flex items-center" style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: '16px', lineHeight: 1, color: stats.model_status === 'ERROR' ? '#991b1b' : stats.model_status === 'LOADING' ? '#9ca3af' : '#1a3db5' }}>
                                {stats.model_status} {stats.model_status === 'LOADING' && <span className="animate-blink">_</span>}
                            </div>
                            <div className="mt-1" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: '10px', color: '#9ca3af', letterSpacing: '0.08em' }}>
                                MODEL STATUS
                            </div>
                        </div>

                        {/* Model Info Section */}
                        <div className="p-4 mt-auto border-t border-[#e5e7eb]">
                            <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#9ca3af', letterSpacing: '0.1em' }}>
                                MODEL
                            </div>
                            <div className="flex flex-col gap-1" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#374151' }}>
                                <div>AEGIS-MMFFN-v1.0</div>
                                <div>4× CNN  +  FNN</div>
                                <div>Binary cross-entropy</div>
                                <div>Adam · lr 1e-4</div>
                                <div>2,000 training dossiers</div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ROW 3 - Bottom Bar */}
            <div className="h-[80px] shrink-0 border-t border-[#111111] bg-[#ffffff] grid grid-cols-3">
                <div className="border-r border-[#e5e7eb] px-6 flex flex-col justify-center">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px', color: '#9ca3af', letterSpacing: '0.08em' }}>TRAINING DATASET</div>
                    <div className="mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: '16px', color: '#111111' }}>2,000 DOSSIERS</div>
                    <div className="mt-0.5" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '11px', color: '#9ca3af' }}>1,000 safe  ·  1,000 risked  ·  8 fraud types</div>
                </div>
                <div className="border-r border-[#e5e7eb] px-6 flex flex-col justify-center">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px', color: '#9ca3af', letterSpacing: '0.08em' }}>LAST ANALYSIS</div>
                    <div className="mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: '16px', color: '#111111' }}>{stats.last_applicant_id || "NONE YET"}</div>
                    <div className="mt-0.5" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '11px', color: stats.last_risk_level === 'HIGH' || stats.last_risk_level === 'CRITICAL' ? '#991b1b' : stats.last_risk_level ? '#1a3db5' : '#9ca3af' }}>
                        {stats.last_risk_level ? `${stats.last_risk_level} RISK · ${time}` : "awaiting first ingestion"}
                    </div>
                </div>
                <div className="px-6 flex flex-col justify-center">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px', color: '#9ca3af', letterSpacing: '0.08em' }}>SYSTEM TIME</div>
                    <div className="mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: '16px', color: '#111111' }}>{time}</div>
                    <div className="mt-0.5" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '11px', color: '#9ca3af' }}>IST · Session active</div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
