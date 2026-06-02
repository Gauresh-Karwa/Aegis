import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect } from 'react';

const RiskGauge = ({ score }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);

  useEffect(() => {
    const controls = animate(count, score || 0, { duration: 2, ease: "easeOut" });
    return controls.stop;
  }, [score, count]);

  const getRiskColor = (val) => {
    if (val >= 70) return 'text-action-orange'; // Muted orange for severe
    if (val >= 40) return 'text-yellow-500';
    return 'text-verification-green';
  };

  const getRiskStroke = (val) => {
    if (val >= 70) return '#d97706'; // Tailwind amber-600/orange
    if (val >= 40) return '#eab308'; // Tailwind yellow-500
    return '#10b981'; // Emerald 500
  };

  return (
    <div className="panel-glass p-6 flex flex-col items-center justify-center min-h-[200px]">
      <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase w-full text-left mb-6 border-b border-white/5 pb-2">
        Risk Assessment
      </h3>
      
      <div className="relative flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64" cy="64" r="56"
            fill="transparent"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="8"
          />
          <motion.circle
            cx="64" cy="64" r="56"
            fill="transparent"
            stroke={getRiskStroke(score || 0)}
            strokeWidth="8"
            strokeDasharray={352}
            initial={{ strokeDashoffset: 352 }}
            animate={{ strokeDashoffset: 352 - (352 * (score || 0)) / 100 }}
            transition={{ duration: 2, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className={`text-4xl font-bold font-sans ${getRiskColor(score || 0)}`}>
            {rounded}
          </motion.span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">Score</span>
        </div>
      </div>
    </div>
  );
};

export default RiskGauge;
