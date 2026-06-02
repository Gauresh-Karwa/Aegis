import React, { useState } from 'react';
import { Search, Download, ShieldCheck, AlertCircle } from 'lucide-react';

// Mock database to demonstrate functionality
const mockDatabase = [
  { id: 'AP-992-811', name: 'Rajesh Kumar', docType: 'Salary Slip', date: '2026-06-02', risk: 'LOW', score: 15 },
  { id: 'AP-992-812', name: 'Priya Sharma', docType: 'ITR', date: '2026-06-01', risk: 'LOW', score: 20 },
  { id: 'AP-992-813', name: 'Amit Patel', docType: 'Bank Statement', date: '2026-05-28', risk: 'HIGH', score: 85 },
  { id: 'AP-992-814', name: 'Neha Gupta', docType: 'Resume', date: '2026-05-25', risk: 'LOW', score: 10 },
  { id: 'AP-992-815', name: 'Vikram Singh', docType: 'Property Deed', date: '2026-05-20', risk: 'HIGH', score: 92 },
];

const DatabaseView = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDB = mockDatabase.filter(entry => 
    entry.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    entry.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownload = (name) => {
    // In a real app, this would trigger a backend PDF generation.
    // Here we'll simulate opening the browser print dialog for the report view.
    alert(`Generating RBI Compliance Report for ${name}. In production, this generates a strict PDF based on the 8-Layer output.`);
  };

  return (
    <div className="w-full h-full p-8 bg-enterprise-900 text-slate-200">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Audit & Compliance Database</h1>
            <p className="text-sm text-slate-400 mt-1">Immutable ledger of all processed applications (Layer 8)</p>
          </div>
          
          <div className="relative w-72">
            <input 
              type="text" 
              placeholder="Search by ID or Name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-enterprise-800 border border-white/10 px-4 py-2 text-sm focus:outline-none focus:border-verification-green/50 text-white placeholder-slate-500 rounded-none"
            />
          </div>
        </div>

        <div className="border border-white/10 bg-enterprise-800/50 rounded-none overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-enterprise-800 border-b border-white/5 text-xs uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Application ID</th>
                <th className="px-6 py-4 font-semibold">Applicant Name</th>
                <th className="px-6 py-4 font-semibold">Document Type</th>
                <th className="px-6 py-4 font-semibold">Processed Date</th>
                <th className="px-6 py-4 font-semibold">Risk Exposure</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredDB.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-300">{row.id}</td>
                  <td className="px-6 py-4 font-medium text-white">{row.name}</td>
                  <td className="px-6 py-4 text-slate-400">{row.docType}</td>
                  <td className="px-6 py-4 text-slate-400">{row.date}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                      row.risk === 'HIGH' ? 'bg-action-orange/10 text-action-orange border border-action-orange/20' : 
                      'bg-verification-green/10 text-verification-green border border-verification-green/20'
                    }`}>
                      {row.risk} ({row.score}/100)
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDownload(row.name)}
                      className="text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 border border-blue-500/30 px-3 py-1.5 hover:bg-blue-500/10 transition-colors"
                    >
                      Download Report
                    </button>
                  </td>
                </tr>
              ))}
              
              {filteredDB.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                    No records found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DatabaseView;
