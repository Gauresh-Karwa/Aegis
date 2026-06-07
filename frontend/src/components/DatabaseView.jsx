import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Download, ShieldCheck, AlertCircle, Loader } from 'lucide-react';

const DatabaseView = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dbData, setDbData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDatabase = async () => {
      try {
        setLoading(true);
        const res = await axios.get('http://127.0.0.1:8000/database');
        setDbData(res.data.members || []);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch database:", err);
        setError("Could not connect to the database engine. Ensure the backend is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchDatabase();
  }, []);

  const filteredDB = dbData.filter(entry => 
    entry.applicant_id?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    entry.filename?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownload = (id) => {
    alert(`Generating Systematic Intelligence Report for ID: ${id}.`);
  };

  return (
    <div className="w-full h-full p-8 bg-brand-slate text-brand-navy">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Applicant Database</h1>
            <p className="text-sm text-brand-gray mt-2">Immutable ledger of all processed applications (Layer 8 Audit Log)</p>
          </div>
          
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by ID or Document..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue rounded shadow-sm"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500">
               <Loader className="w-8 h-8 animate-spin mb-4 text-brand-blue" />
               <p>Loading 2000 applicant dossiers from the intelligence engine...</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Applicant ID</th>
                    <th className="px-6 py-4 font-semibold">Document Name</th>
                    <th className="px-6 py-4 font-semibold">Processed Date</th>
                    <th className="px-6 py-4 font-semibold">Risk Exposure</th>
                    <th className="px-6 py-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDB.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-500">{row.applicant_id}</td>
                      <td className="px-6 py-4 font-medium text-brand-navy">{row.filename}</td>
                      <td className="px-6 py-4 text-slate-500">{new Date(row.submission_date).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded ${
                          row.risk_score >= 50 ? 'bg-red-50 text-red-700 border border-red-200' : 
                          'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {row.risk_band} ({Math.round(row.risk_score)}/100)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDownload(row.applicant_id)}
                          className="text-xs font-bold uppercase tracking-widest text-brand-blue hover:text-blue-800 border border-brand-blue/30 px-3 py-1.5 hover:bg-blue-50 transition-colors rounded inline-flex items-center gap-2"
                        >
                          <Download className="w-3 h-3" /> Report
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
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseView;
