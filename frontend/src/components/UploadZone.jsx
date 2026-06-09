import React, { useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';

const UploadZone = ({ onUpload, status = 'idle' }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

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
      onUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (status !== 'idle') return;
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
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
      // Border is handled by SVG rect
      boxStyle.border = '2px solid transparent'; 
  } else {
      boxStyle.border = '2px dashed #d1d5db';
  }

  return (
    <div
      style={boxStyle}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => status === 'idle' && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        webkitdirectory="true"
        directory="true"
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
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#991b1b' }}>
              Invalid folder structure
          </div>
      )}

      {status === 'idle' && isDragActive && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#1a3db5' }}>
              DROP FOLDER NOW
          </div>
      )}

      {status === 'idle' && !isDragActive && (
        <>
            <FolderOpen size={24} color="#9ca3af" strokeWidth={1.5} />
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '13px', color: '#111111', letterSpacing: '0.06em' }}>
                DROP APPLICANT FOLDER
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9ca3af' }}>
                identity · salary · itr · land_record
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9ca3af' }}>
                or click to browse
            </div>
        </>
      )}
    </div>
  );
};

export default UploadZone;
