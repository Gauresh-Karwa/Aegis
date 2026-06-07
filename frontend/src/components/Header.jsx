import React from 'react';

const Header = ({ currentRoute, setCurrentRoute }) => {
  return (
    <nav className="w-full flex items-center justify-between px-8 bg-[#ffffff] border-b border-[#ddd]" style={{ height: '60px' }}>
      <div className="flex items-center gap-8 h-full">
        <div 
          className="text-[20px] font-bold cursor-pointer text-black"
          onClick={() => setCurrentRoute('upload')}
        >
          AEGIS
        </div>
        
        {/* Main Navigation */}
        <div className="flex items-center gap-6 h-full ml-4">
           <button 
             onClick={() => setCurrentRoute('upload')}
             className={`h-full px-2 text-[14px] flex items-center transition-colors ${currentRoute === 'upload' || currentRoute === 'hub' ? 'text-[#000] border-b-2 border-[#000]' : 'text-[#111] hover:text-[#000] border-b-2 border-transparent'}`}
           >
             Forensic
           </button>
           <button 
             onClick={() => setCurrentRoute('database')}
             className={`h-full px-2 text-[14px] flex items-center transition-colors ${currentRoute === 'database' ? 'text-[#000] border-b-2 border-[#000]' : 'text-[#111] hover:text-[#000] border-b-2 border-transparent'}`}
           >
             Database
           </button>
        </div>
      </div>
    </nav>
  );
};

export default Header;
