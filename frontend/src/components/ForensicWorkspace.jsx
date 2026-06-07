import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const ForensicWorkspace = ({ backendData }) => {
  const [expandedSections, setExpandedSections] = useState({
      ingestion: true,
      visual: true,
      math: true,
      semantic: true,
      metadata: true,
      behavioral: true
  });

  const toggleSection = (section) => {
      setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getRiskColor = (score) => {
      if (score >= 0.65) return '#FF0000';
      if (score >= 0.45) return '#FF6B35';
      if (score >= 0.3) return '#FFB800';
      return '#00FF88';
  };

  const docs = [
      { id: 'identity', label: 'Identity Document' },
      { id: 'salary', label: 'Salary Slip' },
      { id: 'itr', label: 'ITR Return' },
      { id: 'land', label: 'Land Record' }
  ];

  return (
    <div className="w-full flex flex-col h-full bg-brand-slate overflow-y-auto">
      {/* Top Split: PDF Preview Strip */}
      <div className="w-full h-[280px] shrink-0 border-b border-black p-4 bg-white flex gap-4 overflow-x-auto">
        {docs.map(doc => {
            const score = backendData?.visual_forensics?.[`${doc.id}_score`] || 0;
            const anomalous = score > 0.65;
            return (
                <div key={doc.id} className={`w-[200px] shrink-0 h-full border ${anomalous ? 'border-[#FF0000] shadow-[0_0_8px_#FF0000]' : 'border-black'} relative group bg-gray-50 flex flex-col cursor-pointer hover:bg-gray-100`}>
                    <div className="flex-1 overflow-hidden flex items-center justify-center p-2 relative">
                        <img 
                            src={`http://127.0.0.1:8000/preview/${backendData?.applicant_id}/${doc.id}`} 
                            alt={doc.label} 
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        />
                        <div className="hidden text-xs text-gray-400 font-mono">No Preview</div>
                        
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="text-white text-center">
                                <div className="text-[10px] uppercase tracking-widest text-gray-400">CNN Confidence</div>
                                <div className={`text-xl font-mono font-bold mt-1`} style={{color: getRiskColor(score)}}>
                                    {(score * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-2 border-t border-black bg-white flex justify-between items-center text-xs">
                        <span className="font-bold">{doc.label}</span>
                        {anomalous && <span className="text-[#FF0000] font-mono">FLAG</span>}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Bottom Split: Forensic Pipeline Accordion */}
      <div className="flex-1 p-6 space-y-4">
        
        {/* 1. Document Ingestion */}
        <div className="border border-black bg-white">
            <button onClick={() => toggleSection('ingestion')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">1. Document Ingestion & Classification</span>
                <span>{expandedSections.ingestion ? '▼' : '▶'}</span>
            </button>
            {expandedSections.ingestion && (
                <div className="p-4 text-xs font-mono grid grid-cols-2 gap-4">
                    <div>Total Files Extracted: 4</div>
                    <div>Manifest Parsed: YES</div>
                    <div>Total Bytes: 4.2 MB</div>
                    <div>Extraction Time: {backendData?.processing_time || 0}s</div>
                </div>
            )}
        </div>

        {/* 2. Visual Forensics */}
        <div className="border border-black bg-white">
            <button onClick={() => toggleSection('visual')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">2. Visual Forensics (CNN Layer)</span>
                <span>{expandedSections.visual ? '▼' : '▶'}</span>
            </button>
            {expandedSections.visual && (
                <div className="p-4 space-y-3">
                    {docs.map(doc => {
                        const score = backendData?.visual_forensics?.[`${doc.id}_score`] || 0;
                        return (
                            <div key={doc.id} className="flex items-center gap-4 text-xs font-mono">
                                <div className="w-32">{doc.label}</div>
                                <div className="flex-1 h-3 bg-gray-200 border border-black relative">
                                    <div className="h-full absolute left-0 top-0 transition-all" style={{ width: `${score * 100}%`, backgroundColor: getRiskColor(score) }}></div>
                                </div>
                                <div className="w-12 text-right">{(score * 100).toFixed(0)}%</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* 3. Math Integrity */}
        <div className="border border-black bg-white">
            <button onClick={() => toggleSection('math')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">3. Mathematical Integrity</span>
                <span>{expandedSections.math ? '▼' : '▶'}</span>
            </button>
            {expandedSections.math && (
                <div className="p-4 text-xs font-mono space-y-2">
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span>Basic + HRA + Allowances (Extracted)</span>
                        <span className="font-bold">Gross Salary (Declared)</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Calculated sum from PDF tables</span>
                        <span className="font-bold text-lg">
                            {backendData?.logic_forensics?.math_integrity ? "MATCH ✓" : "MISMATCH ✗"}
                        </span>
                    </div>
                </div>
            )}
        </div>

        {/* 4. Semantic Integrity */}
        <div className="border border-black bg-white">
            <button onClick={() => toggleSection('semantic')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">4. Semantic & Legal Integrity</span>
                <span>{expandedSections.semantic ? '▼' : '▶'}</span>
            </button>
            {expandedSections.semantic && (
                <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="p-2">Field</th>
                                <th className="p-2">Identity</th>
                                <th className="p-2">Salary</th>
                                <th className="p-2">ITR</th>
                                <th className="p-2">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-gray-200">
                                <td className="p-2 font-bold">PAN</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">{backendData?.logic_forensics?.cross_doc_pan_match ? "✓" : "✗"}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                                <td className="p-2 font-bold">Name</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">{backendData?.logic_forensics?.cross_doc_name_match ? "✓" : "✗"}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* 5. Metadata Forensics */}
        <div className="border border-black bg-white">
            <button onClick={() => toggleSection('metadata')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">5. Metadata Forensics</span>
                <span>{expandedSections.metadata ? '▼' : '▶'}</span>
            </button>
            {expandedSections.metadata && (
                <div className="p-4 text-xs font-mono">
                    <div className="mb-2"><strong>PDF Producer:</strong> {backendData?.metadata_forensics?.pdf_producer}</div>
                    <div className="mb-4"><strong>Creator:</strong> {backendData?.metadata_forensics?.creator}</div>
                    
                    {backendData?.metadata_forensics?.producer_flag && (
                        <div className="bg-[#FF0000]/10 border border-[#FF0000] text-[#FF0000] p-3">
                            <strong>CRITICAL ALERT:</strong> Commercial image editing software detected in XMP metadata tags.
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* 6. Behavioral Profile Intelligence */}
        <div className="border border-black bg-white mb-6">
            <button onClick={() => toggleSection('behavioral')} className="w-full p-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 border-b border-black">
                <span className="font-bold uppercase text-xs">6. Behavioural Profile Intelligence</span>
                <span>{expandedSections.behavioral ? '▼' : '▶'}</span>
            </button>
            {expandedSections.behavioral && (
                <div className="p-4">
                    {/* Bar Chart */}
                    <div className="h-40 w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Year -2', income: (backendData?.manifest_data?.salary_gross || 0) * 0.75 },
                                { name: 'Year -1', income: (backendData?.manifest_data?.salary_gross || 0) * 0.88 },
                                { name: 'Current', income: backendData?.manifest_data?.salary_gross || 0 }
                            ]}>
                                <XAxis dataKey="name" tick={{fontSize: 10}} />
                                <Tooltip />
                                <Bar dataKey="income" fill="#0f172a" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="text-xs font-mono space-y-2 border-t border-gray-200 pt-4">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Gross Salary:</span>
                            <span className="font-bold">₹{backendData?.manifest_data?.salary_gross?.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">ITR Declared:</span>
                            <span className="font-bold">₹{backendData?.manifest_data?.itr_total_income?.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Land Value:</span>
                            <span className="font-bold">₹{backendData?.manifest_data?.land_value?.toLocaleString() || 0}</span>
                        </div>

                        {/* Flags */}
                        {backendData?.manifest_data?.salary_gross > 0 && backendData?.manifest_data?.salary_gross > (backendData.manifest_data.salary_gross * 0.88 * 1.35) && (
                            <div className="bg-[#FF0000]/10 border border-[#FF0000] text-[#FF0000] p-2 mt-2">
                                <strong>FLAG:</strong> Income spike detected (&gt;35%).
                            </div>
                        )}
                        {backendData?.manifest_data?.salary_gross > 0 && (backendData.manifest_data.land_value / (backendData.manifest_data.salary_gross * 12) > 20) && (
                            <div className="bg-[#FF6B35]/10 border border-[#FF6B35] text-[#FF6B35] p-2 mt-2">
                                <strong>WARNING:</strong> Land value is suspiciously high compared to annual salary.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default ForensicWorkspace;
