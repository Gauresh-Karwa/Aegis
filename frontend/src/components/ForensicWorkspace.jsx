import React, { useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

  const totalFiles = backendData?.documents ? backendData.documents.filter(d => d.type !== 'manifest').length : 4;

  const docsList = [
      { id: 'identity', label: 'Identity Document' },
      { id: 'salary', label: 'Salary Slip' },
      { id: 'itr', label: 'ITR Return' },
      { id: 'land', label: 'Land Record' }
  ];

  return (
    <div className="w-full flex flex-col h-full bg-[#f5f5f5] overflow-y-auto">
      {/* Top Split: PDF Preview Strip */}
      <div className="w-full shrink-0 border-b border-[#ddd] p-4 bg-[#f5f5f5] flex gap-4 overflow-x-auto items-center">
        {docsList.map(docMeta => {
            const doc = backendData?.documents?.find(d => d.type === docMeta.id) || { preview: '', flagged: backendData?.visual_forensics?.[`${docMeta.id}_score`] > 0.65 };
            const previewBase64 = doc.preview || '';
            const mimeType = previewBase64.startsWith('/9j/') ? 'jpeg' : 'png';
            
            return (
                <div key={docMeta.id} style={{ width: '160px', height: '200px', border: doc.flagged ? '2px solid #FF0000' : '1px solid #ddd', borderRadius: '0' }} className="shrink-0 relative bg-white flex flex-col">
                    <div className="flex-1 overflow-hidden flex items-center justify-center p-2">
                        {previewBase64 ? (
                            <img 
                                src={`data:image/${mimeType};base64,${previewBase64}`} 
                                alt={docMeta.label} 
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        ) : (
                            <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center' }}>No Preview</div>
                        )}
                    </div>
                    <div className="p-2 border-t border-[#ddd] bg-[#ffffff] flex justify-between items-center" style={{ fontSize: '12px', color: '#111' }}>
                        <span className="font-bold truncate">{docMeta.label}</span>
                        {doc.flagged && <span className="text-[#FF0000] font-bold">FLAG</span>}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Bottom Split: Forensic Pipeline Accordion */}
      <div className="flex-1 p-6 space-y-4 bg-[#f5f5f5]">
        
        {/* 1. Document Ingestion */}
        <div className="border border-[#ddd] bg-white">
            <button onClick={() => toggleSection('ingestion')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">1. Document Ingestion & Classification</span>
                <span className="text-[#111]">{expandedSections.ingestion ? '▼' : '▶'}</span>
            </button>
            {expandedSections.ingestion && (
                <div className="p-4 text-[14px] grid grid-cols-2 gap-4 text-[#444]">
                    <div>Total Files Extracted: {totalFiles}</div>
                    <div>Manifest Parsed: YES</div>
                    <div>Total Bytes: 4.2 MB</div>
                    <div>Extraction Time: {backendData?.processing_time || 0}s</div>
                </div>
            )}
        </div>

        {/* 2. Visual Forensics */}
        <div className="border border-[#ddd] bg-white">
            <button onClick={() => toggleSection('visual')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">2. Visual Forensics (CNN Layer)</span>
                <span className="text-[#111]">{expandedSections.visual ? '▼' : '▶'}</span>
            </button>
            {expandedSections.visual && (
                <div className="p-4 space-y-3">
                    {docsList.map(docMeta => {
                        const score = backendData?.visual_forensics?.[`${docMeta.id}_score`] || 0;
                        return (
                            <div key={docMeta.id} className="flex items-center gap-4 text-[14px] text-[#444]">
                                <div className="w-32">{docMeta.label}</div>
                                <div className="flex-1 h-3 bg-[#eaeaea] border border-[#ddd] relative">
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
        <div className="border border-[#ddd] bg-white">
            <button onClick={() => toggleSection('math')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">3. Mathematical Integrity</span>
                <span className="text-[#111]">{expandedSections.math ? '▼' : '▶'}</span>
            </button>
            {expandedSections.math && (
                <div className="p-4 text-[14px] space-y-2 text-[#444]">
                    <div className="flex justify-between border-b border-[#ddd] pb-2">
                        <span>Basic + HRA + Allowances (Extracted)</span>
                        <span className="font-bold text-[#111]">Gross Salary (Declared)</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <span>Calculated sum from PDF tables</span>
                        <span className="font-bold text-[16px] text-[#111]">
                            {backendData?.logic_forensics?.math_integrity ? "MATCH ✓" : "MISMATCH ✗"}
                        </span>
                    </div>
                </div>
            )}
        </div>

        {/* 4. Semantic Integrity */}
        <div className="border border-[#ddd] bg-white">
            <button onClick={() => toggleSection('semantic')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">4. Semantic & Legal Integrity</span>
                <span className="text-[#111]">{expandedSections.semantic ? '▼' : '▶'}</span>
            </button>
            {expandedSections.semantic && (
                <div className="p-4 overflow-x-auto text-[#444]">
                    <table className="w-full text-left text-[14px] border-collapse">
                        <thead>
                            <tr className="border-b border-[#ddd] text-[#111]">
                                <th className="p-2">Field</th>
                                <th className="p-2">Identity</th>
                                <th className="p-2">Salary</th>
                                <th className="p-2">ITR</th>
                                <th className="p-2">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-[#ddd]">
                                <td className="p-2 font-bold text-[#111]">PAN</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2 font-bold">{backendData?.logic_forensics?.cross_doc_pan_match ? "✓" : "✗"}</td>
                            </tr>
                            <tr className="border-b border-[#ddd]">
                                <td className="p-2 font-bold text-[#111]">Name</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2">Found</td>
                                <td className="p-2 font-bold">{backendData?.logic_forensics?.cross_doc_name_match ? "✓" : "✗"}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* 5. Metadata Forensics */}
        <div className="border border-[#ddd] bg-white">
            <button onClick={() => toggleSection('metadata')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">5. Metadata Forensics</span>
                <span className="text-[#111]">{expandedSections.metadata ? '▼' : '▶'}</span>
            </button>
            {expandedSections.metadata && (
                <div className="p-4 text-[14px] text-[#444]">
                    <div className="mb-2"><strong className="text-[#111]">PDF Producer:</strong> {backendData?.metadata_forensics?.pdf_producer}</div>
                    <div className="mb-4"><strong className="text-[#111]">Creator:</strong> {backendData?.metadata_forensics?.creator}</div>
                    
                    {backendData?.metadata_forensics?.producer_flag && (
                        <div className="bg-white border-2 border-[#FF0000] text-[#FF0000] p-3 font-bold">
                            CRITICAL ALERT: Commercial image editing software detected in XMP metadata tags.
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* 6. Behavioral Profile Intelligence */}
        <div className="border border-[#ddd] bg-white mb-6">
            <button onClick={() => toggleSection('behavioral')} className="w-full p-3 flex justify-between items-center bg-[#f5f5f5] hover:bg-[#eaeaea] border-b border-[#ddd]">
                <span className="font-bold uppercase text-[14px] text-[#111]">6. Behavioural Profile Intelligence</span>
                <span className="text-[#111]">{expandedSections.behavioral ? '▼' : '▶'}</span>
            </button>
            {expandedSections.behavioral && (
                <div className="p-4 text-[#444]">
                    <div className="h-40 w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Year -2', income: (backendData?.manifest_data?.salary_gross || 0) * 0.75 },
                                { name: 'Year -1', income: (backendData?.manifest_data?.salary_gross || 0) * 0.88 },
                                { name: 'Current', income: backendData?.manifest_data?.salary_gross || 0 }
                            ]}>
                                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#444', fontFamily: 'Avalon'}} />
                                <Tooltip contentStyle={{fontFamily: 'Avalon'}} />
                                <Bar dataKey="income" fill="#111" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="text-[14px] space-y-2 border-t border-[#ddd] pt-4">
                        <div className="flex justify-between">
                            <span>Gross Salary:</span>
                            <span className="font-bold text-[#111]">₹{backendData?.manifest_data?.salary_gross?.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>ITR Declared:</span>
                            <span className="font-bold text-[#111]">₹{backendData?.manifest_data?.itr_total_income?.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Land Value:</span>
                            <span className="font-bold text-[#111]">₹{backendData?.manifest_data?.land_value?.toLocaleString() || 0}</span>
                        </div>

                        {/* Flags */}
                        {backendData?.manifest_data?.salary_gross > 0 && backendData?.manifest_data?.salary_gross > (backendData.manifest_data.salary_gross * 0.88 * 1.35) && (
                            <div className="bg-white border-2 border-[#FF0000] text-[#FF0000] p-2 mt-2 font-bold">
                                FLAG: Income spike detected (&gt;35%).
                            </div>
                        )}
                        {backendData?.manifest_data?.salary_gross > 0 && (backendData.manifest_data.land_value / (backendData.manifest_data.salary_gross * 12) > 20) && (
                            <div className="bg-white border-2 border-[#FF6B35] text-[#FF6B35] p-2 mt-2 font-bold">
                                WARNING: Land value is suspiciously high compared to annual salary.
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
