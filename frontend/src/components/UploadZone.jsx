import React, { useRef, useState } from 'react';
import { FolderOpen, FileText, Layers } from 'lucide-react';

const UploadZone = ({ onUpload, status = 'idle' }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadMode, setUploadMode] = useState('folder'); // 'folder' | 'single' | 'batch'
  
  const fileInputRef = useRef(null);
  const singleInputRef = useRef(null);
  const batchInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== 'idle') return;
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== 'idle') return;
    
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(
        Array.from(e.dataTransfer.files), 
        uploadMode === 'batch', 
        uploadMode === 'single'
      );
    }
  };

  const handleFileSelect = (e) => {
    if (status !== 'idle') return;
    if (e.target.files && e.target.files.length > 0) {
      onUpload(
        Array.from(e.target.files), 
        uploadMode === 'batch', 
        uploadMode === 'single'
      );
    }
  };

  let boxStyle = {
    width: '480px',
    height: '160px',
    background: '#ffffff',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    position: 'relative',
    cursor: status === 'idle' ? 'pointer' : 'default',
    overflow: 'hidden'
  };

  // State Overrides
  if (status === 'error') {
      boxStyle.border = '2px solid #991b1b';
  } else if (status === 'loading') {
      boxStyle.border = '2px solid #111111';
  } else if (isDragActive) {
      boxStyle.background = '#f0f4ff';
      boxStyle.border = '2px solid transparent'; 
  } else {
      boxStyle.border = '2px dashed #d1d5db';
  }

  const modeTabsStyle = {
    display: 'flex',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '12px',
    backgroundColor: '#fafafa',
    width: '480px'
  };

  const tabButtonStyle = (mode) => ({
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    backgroundColor: uploadMode === mode ? '#111111' : 'transparent',
    color: uploadMode === mode ? '#ffffff' : '#666666',
    fontFamily: "'Inter', sans-serif",
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: status === 'idle' ? 'pointer' : 'default',
    transition: 'all 150ms ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
      {/* Upload Mode Tabs Selector */}
      <div style={modeTabsStyle}>
        <button 
          type="button"
          onClick={() => status === 'idle' && setUploadMode('folder')} 
          style={tabButtonStyle('folder')}
          disabled={status !== 'idle'}
        >
          Folder Dossier
        </button>
        <button 
          type="button"
          onClick={() => status === 'idle' && setUploadMode('single')} 
          style={tabButtonStyle('single')}
          disabled={status !== 'idle'}
        >
          Single Doc Update
        </button>
        <button 
          type="button"
          onClick={() => status === 'idle' && setUploadMode('batch')} 
          style={tabButtonStyle('batch')}
          disabled={status !== 'idle'}
        >
          Batch (.ZIP)
        </button>
      </div>

      <div
        style={boxStyle}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (status !== 'idle') return;
          if (uploadMode === 'folder') {
            fileInputRef.current?.click();
          } else if (uploadMode === 'single') {
            singleInputRef.current?.click();
          } else if (uploadMode === 'batch') {
            batchInputRef.current?.click();
          }
        }}
      >
        {/* Input 1: Folder upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          webkitdirectory="true"
          directory="true"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {/* Input 2: Single PDF upload */}
        <input
          ref={singleInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {/* Input 3: ZIP batch upload */}
        <input
          ref={batchInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isDragActive && status === 'idle' && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ borderRadius: '4px' }}>
              <rect 
                  x="1" y="1" width="478" height="158" 
                  fill="none" 
                  stroke="#1a3db5" 
                  strokeWidth="2" 
                  strokeDasharray="10, 10" 
                  className="animate-march"
                  rx="3"
              />
          </svg>
        )}

        {status === 'loading' && (
            <>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#111111' }}>
                ANALYSING...
            </div>
            <div className="absolute bottom-0 left-0 h-[2px] bg-[#111111]" style={{ animation: 'progress 2.5s linear forwards' }}></div>
            <style>{`
                @keyframes progress {
                    0% { width: 0%; }
                    100% { width: 100%; }
                }
            `}</style>
          </>
        )}

        {status === 'error' && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>
                Analysis Failed / Invalid Input
            </div>
        )}

        {status === 'idle' && isDragActive && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#1a3db5' }}>
                DROP {uploadMode === 'folder' ? 'FOLDER' : (uploadMode === 'single' ? 'PDF' : 'ZIP')} NOW
            </div>
        )}

        {status === 'idle' && !isDragActive && (
          <>
            {uploadMode === 'folder' && (
              <>
                <FolderOpen size={24} color="#9ca3af" strokeWidth={1.5} />
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#111111', letterSpacing: '0.06em' }}>
                    DROP APPLICANT FOLDER
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9ca3af' }}>
                    identity · salary · itr · land_record
                </div>
              </>
            )}
            
            {uploadMode === 'single' && (
              <>
                <FileText size={24} color="#9ca3af" strokeWidth={1.5} />
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#111111', letterSpacing: '0.06em' }}>
                    DROP SINGLE DOCUMENT (.PDF)
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9ca3af' }}>
                    Salary Slip OR ITR OR Land OR Identity
                </div>
              </>
            )}

            {uploadMode === 'batch' && (
              <>
                <Layers size={24} color="#9ca3af" strokeWidth={1.5} />
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#111111', letterSpacing: '0.06em' }}>
                    DROP BATCH FILE (.ZIP)
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9ca3af' }}>
                    Contains multiple applicant zip archives
                </div>
              </>
            )}

            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9ca3af' }}>
                or click to browse
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
