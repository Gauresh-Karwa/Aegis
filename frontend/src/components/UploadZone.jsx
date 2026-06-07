import React, { useRef, useState } from 'react';
import { FolderUp } from 'lucide-react';

const UploadZone = ({ onUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
    }
  };

  return (
    <div
      style={{
          width: '360px',
          height: '160px',
          border: '1.5px solid #000000',
          background: isDragActive ? '#f0f0f0' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          margin: '0 auto'
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        multiple
        webkitdirectory="true"
        directory="true"
      />
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
        <FolderUp size={32} color="#000000" style={{ marginBottom: '8px' }} />
        <span style={{ fontSize: '14px', color: '#444' }}>
          {isDragActive ? "Release to analyze" : "Drop applicant folder here"}
        </span>
      </div>
    </div>
  );
};

export default UploadZone;
