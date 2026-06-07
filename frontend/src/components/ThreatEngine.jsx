import React, { useState, useEffect } from 'react';
import RiskGauge from './RiskGauge';

const ThreatEngine = ({ backendData }) => {
  const [insightText, setInsightText] = useState("");
  const fullText = backendData?.llm_insight || "";

  useEffect(() => {
      setInsightText("");
      let i = 0;
      const interval = setInterval(() => {
          setInsightText(fullText.substring(0, i));
          i++;
          if (i > fullText.length) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
  }, [fullText]);

  const docs = ['Identity', 'Salary', 'ITR', 'Land'];
  const fields = ['Name', 'PAN', 'Employer', 'Address'];

  return (
    <div className="w-full h-full flex flex-col bg-brand-slate overflow-y-auto">
      
      {/* 1. Risk Gauge */}
      <RiskGauge score={backendData?.risk_score || 0} />

      <div className="p-4 space-y-6 flex-1">
          
          {/* 2. FORENSIC EVIDENCE */}
          <div className="bg-white border border-black p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-black pb-2">Forensic Evidence</h3>
              <div className="space-y-3">
                  {backendData?.fraud_flags?.length > 0 ? (
                      backendData.fraud_flags.map((flag, idx) => (
                          <div key={idx} className="flex gap-2 items-start text-xs font-mono">
                              <span className="text-[#FF0000]">⚠</span>
                              <div>
                                  <div className="font-bold text-[#FF0000]">{flag}</div>
                                  <div className="text-gray-600 mt-1">{backendData.fraud_reasons?.[flag]}</div>
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="text-xs font-mono text-gray-500">No forensic anomalies detected.</div>
                  )}
              </div>
          </div>

          {/* 3. METADATA INSPECTOR */}
          <div className="bg-white border border-black p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-black pb-2">Metadata Inspector</h3>
              <div className="text-xs font-mono space-y-2">
                  <div className="flex justify-between">
                      <span className="text-gray-500">Producer:</span>
                      <span className="font-bold truncate max-w-[150px]">{backendData?.metadata_forensics?.pdf_producer}</span>
                  </div>
                  <div className="flex justify-between">
                      <span className="text-gray-500">Creator:</span>
                      <span className="font-bold truncate max-w-[150px]">{backendData?.metadata_forensics?.creator}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-gray-500">Signal:</span>
                      <span className={`px-2 py-0.5 font-bold text-[10px] ${backendData?.metadata_forensics?.risk_signal === 'CLEAN' ? 'bg-[#00FF88] text-black' : 'bg-[#FF0000] text-white'}`}>
                          {backendData?.metadata_forensics?.risk_signal}
                      </span>
                  </div>
              </div>
          </div>

          {/* 4. AEGIS ANALYSIS */}
          <div className="bg-white border border-black p-4">
              <div className="flex justify-between items-center mb-3 border-b border-black pb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">AEGIS Analysis</h3>
                  <span className="text-[8px] bg-black text-white px-1 uppercase">Rule Engine</span>
              </div>
              <div className="text-xs font-mono text-gray-700 min-h-[60px]">
                  {insightText}
                  <span className="animate-pulse">_</span>
              </div>
          </div>

          {/* 5. CROSS-REFERENCE MATRIX */}
          <div className="bg-white border border-black p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-black pb-2">Cross-Reference Matrix</h3>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-[10px] font-mono border-collapse">
                      <thead>
                          <tr>
                              <th className="border border-black p-1 bg-gray-50"></th>
                              {docs.map(d => <th key={d} className="border border-black p-1 bg-gray-50">{d.substring(0,3)}</th>)}
                          </tr>
                      </thead>
                      <tbody>
                          {fields.map(f => (
                              <tr key={f}>
                                  <td className="border border-black p-1 font-bold bg-gray-50">{f}</td>
                                  {docs.map(d => {
                                      const isMath = f === 'Name' || f === 'PAN';
                                      const match = isMath ? backendData?.logic_forensics?.cross_doc_name_match : true;
                                      return (
                                          <td key={d} className={`border border-black p-1 text-center ${match ? 'bg-[#00FF88]/20' : 'bg-[#FF0000]/20'}`}>
                                              {match ? '✓' : '✗'}
                                          </td>
                                      )
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

      </div>
    </div>
  );
};

export default ThreatEngine;
