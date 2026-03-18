import React from 'react';

interface Props {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | string;
}

export const RiskBadge: React.FC<Props> = ({ level }) => {
  const isHigh = level.toUpperCase().includes('HIGH') || level.toUpperCase().includes('RED');
  const isMedium = level.toUpperCase().includes('MEDIUM') || level.toUpperCase().includes('AMBER');
  const isLow = level.toUpperCase().includes('LOW') || level.toUpperCase().includes('GREEN');

  let colorClass = 'bg-slate-100 text-slate-800 border-slate-200';
  let icon = '';

  if (isHigh) {
    colorClass = 'bg-red-100 text-red-800 border-red-200';
    icon = '🔴';
  } else if (isMedium) {
    colorClass = 'bg-amber-100 text-amber-800 border-amber-200';
    icon = '🟠';
  } else if (isLow) {
    colorClass = 'bg-green-100 text-green-800 border-green-200';
    icon = '🟢';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
      {icon} {level.toUpperCase()}
    </span>
  );
};
