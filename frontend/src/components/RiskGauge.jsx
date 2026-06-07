import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const RiskGauge = ({ score }) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // Animate score from 0 to final
    let start = 0;
    const end = Math.round(score * 100);
    if (start === end) return;
    
    const duration = 1500; // ms
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
            clearInterval(timer);
            setAnimatedScore(end);
        } else {
            setAnimatedScore(Math.floor(start));
        }
    }, 16);
    
    return () => clearInterval(timer);
  }, [score]);

  const getColor = (s) => {
      if (s >= 65) return '#FF0000';
      if (s >= 45) return '#FF6B35';
      if (s >= 30) return '#FFB800';
      return '#00FF88';
  };

  const radius = 80;
  const circumference = Math.PI * radius; // Half circle
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-6 border-b border-black bg-white">
        <div className="relative w-[200px] h-[120px] overflow-hidden flex justify-center">
            <svg width="200" height="120" viewBox="0 0 200 120" className="rotate-180">
                <circle
                    cx="100" cy="10" r={radius}
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="16"
                    strokeDasharray={circumference}
                    strokeDashoffset="0"
                />
                <circle
                    cx="100" cy="10" r={radius}
                    fill="none"
                    stroke={getColor(animatedScore)}
                    strokeWidth="16"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-75"
                />
            </svg>
            <div className="absolute bottom-2 text-center">
                <div className="text-5xl font-mono font-bold" style={{color: getColor(animatedScore)}}>
                    {animatedScore}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-1">Risk Score</div>
            </div>
        </div>
    </div>
  );
};

export default RiskGauge;
