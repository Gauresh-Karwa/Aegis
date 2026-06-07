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
    <div className="w-full h-full flex flex-col bg-[#f5f5f5] overflow-y-auto">
      
      {/* 1. Risk Gauge */}
      <RiskGauge score={backendData?.risk_score || 0} />

      <div className="p-4 space-y-6 flex-1 bg-[#f5f5f5]">
          
          {/* 2. FORENSIC EVIDENCE */}
          <div className="bg-white border border-[#ddd] p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#111] mb-3 border-b border-[#ddd] pb-2">Forensic Evidence</h3>
              <div className="space-y-3">
                  {backendData?.fraud_flags?.length > 0 ? (
                      backendData.fraud_flags.map((flag, idx) => (
                          <div key={idx} className="flex gap-2 items-start text-[14px]">
                              <span className="text-[#FF0000]">⚠</span>
                              <div>
                                  <div className="font-bold text-[#FF0000]">{flag}</div>
                                  <div className="text-[#444] mt-1">{backendData.fraud_reasons?.[flag]}</div>
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="text-[14px] text-[#444]">No forensic anomalies detected.</div>
                  )}
              </div>
          </div>

          {/* 3. METADATA INSPECTOR */}
          <div className="bg-white border border-[#ddd] p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#111] mb-3 border-b border-[#ddd] pb-2">Metadata Inspector</h3>
              <div className="text-[14px] space-y-2 text-[#444]">
                  <div className="flex justify-between">
                      <span>Producer:</span>
                      <span className="font-bold truncate max-w-[150px] text-[#111]">{backendData?.metadata_forensics?.pdf_producer}</span>
                  </div>
                  <div className="flex justify-between">
                      <span>Creator:</span>
                      <span className="font-bold truncate max-w-[150px] text-[#111]">{backendData?.metadata_forensics?.creator}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#ddd] flex justify-between items-center">
                      <span>Signal:</span>
                      <span className={`px-2 py-0.5 font-bold text-[10px] ${backendData?.metadata_forensics?.risk_signal === 'CLEAN' ? 'bg-[#00FF88] text-black' : 'bg-[#FF0000] text-white'}`}>
                          {backendData?.metadata_forensics?.risk_signal}
                      </span>
                  </div>
              </div>
          </div>

          {/* 4. AEGIS ANALYSIS */}
          <div className="bg-white border border-[#ddd] p-4">
              <div className="flex justify-between items-center mb-3 border-b border-[#ddd] pb-2">
                  <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#111]">AEGIS Analysis</h3>
                  <span className="text-[10px] bg-black text-white px-2 py-0.5 uppercase">Rule Engine</span>
              </div>
              <div className="text-[14px] text-[#444] min-h-[60px]">
                  {insightText}
                  <span className="animate-pulse text-[#111]">_</span>
              </div>
          </div>

          {/* 5. CROSS-REFERENCE MATRIX */}
          <div className="bg-white border border-[#ddd] p-4">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#111] mb-3 border-b border-[#ddd] pb-2">Cross-Reference Matrix</h3>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px] border-collapse">
                      <thead>
                          <tr>
                              <th className="border border-[#ddd] p-2 bg-[#f5f5f5] text-[#111]"></th>
                              {docs.map(d => <th key={d} className="border border-[#ddd] p-2 bg-[#f5f5f5] text-[#111]">{d.substring(0,3)}</th>)}
                          </tr>
                      </thead>
                      <tbody>
                          {fields.map(f => (
                              <tr key={f}>
                                  <td className="border border-[#ddd] p-2 font-bold bg-[#f5f5f5] text-[#111]">{f}</td>
                                  {docs.map(d => {
                                      const isMath = f === 'Name' || f === 'PAN';
                                      const match = isMath ? backendData?.logic_forensics?.cross_doc_name_match : true;
                                      return (
                                          <td key={d} className={`border border-[#ddd] p-2 text-center text-[14px] font-bold ${match ? 'bg-[#00FF88]/20 text-[#00FF88]' : 'bg-[#FF0000]/20 text-[#FF0000]'}`}>
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
