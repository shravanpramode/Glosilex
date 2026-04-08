import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  state?: 'CONFIRMED' | 'POTENTIAL';
  pendingJurisdiction?: string;
  confirmedJurisdiction?: string;
  message?: string;
}

export const DualJurisdictionAlert: React.FC<Props> = ({ state = 'CONFIRMED', pendingJurisdiction, confirmedJurisdiction, message }) => {
  const getFullText = () => {
    if (message) return message;
    if (state === 'POTENTIAL') {
      return `⚠️ Potential Dual Jurisdiction — ${pendingJurisdiction || 'Jurisdiction'} pending formal confirmation. ${confirmedJurisdiction || 'Other jurisdiction'} confirmed.`;
    }
    return '⚠️ Dual Jurisdiction Confirmed — Separate licenses required from DGFT (India) AND BIS (US).';
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-lg my-4 shadow-sm ${state === 'POTENTIAL' ? 'bg-indigo-50 border-indigo-500' : 'bg-amber-50 border-amber-500'}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertTriangle className={`h-5 w-5 ${state === 'POTENTIAL' ? 'text-indigo-500' : 'text-amber-500'}`} aria-hidden="true" />
        </div>
        <div className="ml-3">
          <div className={`text-sm font-bold ${state === 'POTENTIAL' ? 'text-indigo-800' : 'text-amber-800'}`}>
            {getFullText()}
          </div>
        </div>
      </div>
    </div>
  );
};
