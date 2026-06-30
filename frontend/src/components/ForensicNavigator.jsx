import React, { useEffect, useState } from 'react';

const MODULES = [
    { id: 'section-0', name: 'Document Viewer', category: 'Document Viewer' },
    { id: 'section-1', name: 'Identity & Entity Layer', category: 'Identity & Entity' },
    { id: 'section-2', name: 'Visual Forensics & Heatmaps', category: 'Visual Forensics' },
    { id: 'section-3', name: 'Mathematical Integrity', category: 'Mathematical Integrity' },
    { id: 'section-4', name: 'Cross-Document Coherence', category: 'Cross-Document Coherence' },
    { id: 'section-5', name: 'Income & Employment', category: 'Income & Employment' },
    { id: 'section-6', name: 'Property & Liability', category: 'Property & Liability' },
    { id: 'section-6b', name: 'Gold Loan Appraisal', category: 'Gold Loan Appraisal', description: 'Gold appraisal valuation, purity math, LTV ratio, market rate, income ratio' },
    { id: 'section-7', name: 'Behavioral Signatures', category: 'Behavioral Signature' },
    { id: 'section-8', name: 'Audit Evidence Chain', category: 'Case Certification', description: 'Chain of custody, evidence registry, risk build-up, underwriter sign-off' },
    { id: 'section-9', name: 'Underwriting Decision Report', category: 'Underwriting' }
];

const ForensicNavigator = ({ backendData, activeModule, setActiveModule }) => {
    const findings = backendData?.findings || [];
    
    const getStatusColor = (category) => {
        // Gold Loan Appraisal — check findings tagged 'gold' in field_name
        if (category === 'Gold Loan Appraisal') {
            const goldFindings = findings.filter(f =>
                (f.field_name || '').toLowerCase().includes('gold') ||
                (f.check_name || '').toLowerCase().includes('gold')
            );
            if (goldFindings.some(f => f.severity === 'CRITICAL')) return '#ef4444';
            if (goldFindings.some(f => f.severity === 'WARNING'))  return '#f59e0b';
            if (goldFindings.length > 0) return '#10b981';
            // No gold findings at all → grey (not applicable)
            return '#9ca3af';
        }
        const catFindings = findings.filter(f => f.category === category);
        if (catFindings.some(f => f.severity === 'CRITICAL')) return '#ef4444'; // Red
        if (catFindings.some(f => f.severity === 'WARNING')) return '#f59e0b'; // Amber
        return '#10b981'; // Green
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#fafafa]">
            <div className="h-[36px] px-4 border-b border-[#e5e7eb] flex justify-between items-center bg-[#f3f4f6]">
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '10px', color: '#4b5563', letterSpacing: '0.1em' }}>
                    FORENSIC MODULES
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto py-2">
                {MODULES.map((mod) => {
                    const statusColor = getStatusColor(mod.category);
                    const isActive = activeModule === mod.name;
                    
                    return (
                        <div 
                            key={mod.id}
                            onClick={() => setActiveModule && setActiveModule(mod.name)}
                            className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors border-l-2 ${isActive ? 'bg-[#f3f4f6] border-[#111111]' : 'border-transparent hover:bg-[#f9fafb]'}`}
                        >
                            <span 
                                style={{ 
                                    fontFamily: "'Inter', sans-serif", 
                                    fontSize: '11px', 
                                    fontWeight: isActive ? 600 : 500,
                                    color: isActive ? '#111111' : '#4b5563'
                                }}
                            >
                                {mod.name}
                            </span>
                            <div 
                                style={{ 
                                    width: '6px', 
                                    height: '6px', 
                                    borderRadius: '50%', 
                                    backgroundColor: statusColor,
                                    boxShadow: isActive ? `0 0 4px ${statusColor}` : 'none'
                                }} 
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ForensicNavigator;
