import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { motion } from 'framer-motion';

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div
      className={`relative w-full mx-auto rounded-md border-2 border-dashed transition-all duration-300 p-12 text-center cursor-pointer overflow-hidden
        ${isDragActive 
          ? 'border-verification-green bg-verification-green/5' 
          : 'border-white/20 bg-enterprise-800/80 hover:border-verification-green/50 hover:bg-white/5 backdrop-blur-md'
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
        accept="application/pdf,image/jpeg,image/png"
      />
      
      <motion.div 
        animate={{ y: isDragActive ? -5 : 0 }}
        className="flex flex-col items-center justify-center pointer-events-none"
      >
        <UploadCloud size={48} className="text-slate-300 mb-4 opacity-80" />
        <h2 className="text-xl font-bold font-sans tracking-tight text-white mb-2">
          Submit Encrypted Payload
        </h2>
        <p className="text-slate-400 font-medium text-sm">
          Drag & drop secure documents here or <span className="text-verification-green hover:underline">browse local files</span>
        </p>
        <p className="text-[10px] text-slate-500 mt-4 uppercase tracking-widest font-bold">
          Supported Formats: PDF, JPG, PNG (Max 15MB)
        </p>
      </motion.div>
    </div>
  );
};

export default UploadZone;
