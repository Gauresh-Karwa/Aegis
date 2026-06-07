import { useRef, useState } from 'react';
import { UploadCloud, FolderUp } from 'lucide-react';
import { motion } from 'framer-motion';

const UploadZone = ({ onUpload, compact }) => {
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
      className={`relative w-full mx-auto border-2 border-dashed transition-all duration-300 text-center cursor-pointer overflow-hidden
        ${compact ? 'p-4' : 'p-12 rounded-lg'}
        ${isDragActive 
          ? 'border-black bg-gray-100' 
          : 'border-black bg-white hover:bg-gray-50 shadow-sm'
        }
      `}
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
      
      <motion.div 
        animate={{ y: isDragActive ? -5 : 0 }}
        className="flex flex-col items-center justify-center pointer-events-none"
      >
        <div className={`bg-gray-100 rounded-full border border-black ${compact ? 'p-2 mb-2' : 'p-4 mb-4'}`}>
           <FolderUp size={compact ? 20 : 40} className="text-black" />
        </div>
        {!compact && (
            <h2 className="text-xl font-bold font-sans tracking-tight text-black mb-2">
            Upload Applicant Folder
            </h2>
        )}
        <p className={`font-mono text-black ${compact ? 'text-[10px]' : 'font-medium text-sm'}`}>
          {compact ? 'Drop Folder' : 'Drag & drop the dossier folder (4 documents) here'}
        </p>
      </motion.div>
    </div>
  );
};

export default UploadZone;
