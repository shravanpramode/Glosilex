import React from 'react';

interface Props {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  size?: 'sm' | 'md' | 'lg';
}

export const RiskBadge: React.FC<Props> = ({ level, size = 'md' }) => {
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

  let cleanLevel = level;
  const match = level.match(/(HIGH|MEDIUM|LOW)\s*RISK/i);
  if (match) {
    cleanLevel = match[0];
  } else {
    cleanLevel = level.replace(/[🔴🟠🟢]/g, '').trim();
  }

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${sizeClass} ${colorClass}`}>
      {icon} {cleanLevel.toUpperCase()}
    </span>
  );
};
