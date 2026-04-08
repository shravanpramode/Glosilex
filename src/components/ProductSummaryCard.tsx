import React from 'react';
import { FileText } from 'lucide-react';

interface ProductSummaryCardProps {
  data: {
    productName?: string;
    keySpecifications?: string;
    technicalSpecifications?: string;
    destination?: string;
    endUse?: string;
    componentOrigin?: string;
    [key: string]: any;
  };
}

export const ProductSummaryCard: React.FC<ProductSummaryCardProps> = ({ data }) => {
  const fields = [
    { 
      label: 'Product Name', 
      value: data.productName || data.name || data.title 
    },
    { 
      label: 'Key Specifications', 
      value: data.keySpecifications || data.technicalSpecifications || data.specs 
    },
    { 
      label: 'Destination', 
      value: data.destination || data.destinationCountry || data.country 
    },
    { 
      label: 'End-Use', 
      value: data.endUse || data.purpose || data.application 
    },
    { 
      label: 'Component Origin', 
      value: data.componentOrigin || data.origin || data.source 
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" /> Product Summary
        </h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {fields.map((field, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {field.label}
              </span>
              <span className="text-sm text-slate-900 font-medium break-words">
                {field.value || 'Not specified'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
