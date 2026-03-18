import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  steps: string[];
  currentStepIndex: number;
}

export const LoadingSteps: React.FC<Props> = ({ steps, currentStepIndex }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 my-4 max-w-md mx-auto">
      <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Processing Request</h3>
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isPending = index > currentStepIndex;

          return (
            <div key={index} className="flex items-center gap-3">
              {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />}
              {isCurrent && <Loader2 className="h-5 w-5 text-indigo-500 animate-spin flex-shrink-0" />}
              {isPending && <div className="h-5 w-5 rounded-full border-2 border-slate-200 flex-shrink-0" />}
              
              <span className={`text-sm font-medium ${
                isCompleted ? 'text-slate-500 line-through' :
                isCurrent ? 'text-indigo-700' :
                'text-slate-400'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
