import React from 'react';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';

interface RetryInfo {
  attempt: number;
  delayMs: number;
  reason: string;
}

interface Props {
  steps: string[];
  currentStepIndex: number;
  retryInfo?: RetryInfo | null;
}

export const LoadingSteps: React.FC<Props> = ({ steps, currentStepIndex, retryInfo }) => {
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-gray-600">Processing Request</p>

      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const isPending = index > currentStepIndex;

        return (
          <div key={index} className={`flex items-center gap-2 text-sm ${
            isCompleted ? 'text-green-600' :
            isCurrent ? 'text-blue-600 font-medium' :
            'text-gray-400'
          }`}>
            {isCompleted && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {isCurrent && !retryInfo && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
            {isCurrent && retryInfo && <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-500" />}
            {isPending && <div className="w-4 h-4 shrink-0 rounded-full border border-gray-300" />}
            <span>{step}</span>
          </div>
        );
      })}

      {retryInfo && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          ⚠️ Gemini overloaded — retrying (attempt {retryInfo.attempt}, waiting {Math.round(retryInfo.delayMs / 1000)}s)…
          <span className="block text-amber-500 mt-0.5">{retryInfo.reason}</span>
        </div>
      )}
    </div>
  );
};