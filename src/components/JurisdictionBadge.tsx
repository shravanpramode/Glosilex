import React from 'react';

interface Props {
  jurisdiction: 'SCOMET_INDIA' | 'EAR_US' | string;
}

export const JurisdictionBadge: React.FC<Props> = ({ jurisdiction }) => {
  const isScomet = jurisdiction.includes('SCOMET');
  const isEar = jurisdiction.includes('EAR');
  const isEu = jurisdiction.includes('EU');

  if (isScomet) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
        🇮🇳 SCOMET
      </span>
    );
  }

  if (isEar) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
        🇺🇸 EAR
      </span>
    );
  }

  if (isEu) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
        🇪🇺 EU
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
      {jurisdiction}
    </span>
  );
};
