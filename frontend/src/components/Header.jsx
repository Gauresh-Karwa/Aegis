import React from 'react';

const Header = ({ currentRoute, setCurrentRoute }) => {
  return (
    <nav className="w-full bg-[#ffffff] border-b border-[#111111] shrink-0" style={{ height: '52px', padding: '0 24px' }}>
      <div className="flex items-center justify-between h-full">
        {/* LEFT SIDE */}
        <div 
          className="text-[#111111] cursor-pointer"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: '22px', letterSpacing: '0.12em' }}
          onClick={() => setCurrentRoute('upload')}
        >
          AEGIS
        </div>
        
        {/* CENTER */}
        <div className="flex items-center" style={{ gap: '32px', height: '100%' }}>
           <button 
             onClick={() => setCurrentRoute('upload')}
             style={{ 
               fontFamily: "'Inter', sans-serif", 
               fontWeight: 500, 
               fontSize: '13px',
               color: (currentRoute === 'upload' || currentRoute === 'hub') ? '#111111' : '#9ca3af',
               borderBottom: (currentRoute === 'upload' || currentRoute === 'hub') ? '2px solid #111111' : 'none',
               paddingBottom: (currentRoute === 'upload' || currentRoute === 'hub') ? '2px' : '0'
             }}
             className="h-full flex items-center transition-colors hover:text-[#111111]"
           >
             Forensic
           </button>
           <button 
             onClick={() => setCurrentRoute('database')}
             style={{ 
              fontFamily: "'Inter', sans-serif", 
              fontWeight: 500, 
              fontSize: '13px',
              color: currentRoute === 'database' ? '#111111' : '#9ca3af',
              borderBottom: currentRoute === 'database' ? '2px solid #111111' : 'none',
              paddingBottom: currentRoute === 'database' ? '2px' : '0'
            }}
             className="h-full flex items-center transition-colors hover:text-[#111111]"
           >
             Database
           </button>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex flex-col items-end justify-center">
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px', color: '#111111', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                CANARA BANK
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '10px', color: '#9ca3af' }}>
                Fraud Detection Division
            </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;
