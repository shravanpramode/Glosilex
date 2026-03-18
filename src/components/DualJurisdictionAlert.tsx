import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  message?: string;
}

export const DualJurisdictionAlert: React.FC<Props> = ({ message }) => {
  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg my-4 shadow-sm">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide">
            ⚠️ Dual Jurisdiction Alert
          </h3>
          <div className="mt-2 text-sm text-amber-700 font-medium">
            <p>
              {message || 'Both India SCOMET and US EAR apply. You must obtain separate authorizations from DGFT (India) AND BIS (US).'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
