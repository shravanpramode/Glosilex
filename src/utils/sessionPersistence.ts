
export interface ClassifyState {
  productDesc: string;
  scometEnabled: boolean;
  earEnabled: boolean;
  result: any;
}

export interface IcpState {
  companyName: string;
  frozenCompanyName?: string;
  hasExistingIcp: boolean;
  uploadedFileName: string | null;
  uploadedFileText: string | null;
  jurisdictions: string[];
  result: any;
}

export interface ContractsState {
  uploadedFileName: string | null;
  uploadedFileText: string | null;
  reviewScope: string[];
  jurisdictions: string[];
  result: any;
}

const getStorageKey = (userId: string, module: 'classify' | 'icp' | 'contracts') => {
  return `glosilex_${module}_${userId}`;
};

export const saveClassifyState = (userId: string, state: ClassifyState) => {
  // Data Minimization: Omit large AI blobs from local storage
  const minimizedResult = state.result ? { ...state.result } : null;
  if (minimizedResult) {
    delete minimizedResult.scometFinding;
    delete minimizedResult.earFinding;
  }

  const minimizedState = {
    ...state,
    result: minimizedResult
  };

  localStorage.setItem(getStorageKey(userId, 'classify'), JSON.stringify(minimizedState));
};

export const loadClassifyState = (userId: string): ClassifyState | null => {
  const saved = localStorage.getItem(getStorageKey(userId, 'classify'));
  return saved ? JSON.parse(saved) : null;
};

export const saveIcpState = (userId: string, state: IcpState) => {
  // Data Minimization: Omit large document text
  const minimizedState = {
    ...state,
    uploadedFileText: null
  };
  localStorage.setItem(getStorageKey(userId, 'icp'), JSON.stringify(minimizedState));
};

export const loadIcpState = (userId: string): IcpState | null => {
  const saved = localStorage.getItem(getStorageKey(userId, 'icp'));
  return saved ? JSON.parse(saved) : null;
};

export const saveContractsState = (userId: string, state: ContractsState) => {
  // Data Minimization: Omit large document text
  const minimizedState = {
    ...state,
    uploadedFileText: null
  };
  localStorage.setItem(getStorageKey(userId, 'contracts'), JSON.stringify(minimizedState));
};

export const loadContractsState = (userId: string): ContractsState | null => {
  const saved = localStorage.getItem(getStorageKey(userId, 'contracts'));
  return saved ? JSON.parse(saved) : null;
};

export const clearAllSessions = (userId: string) => {
  ['classify', 'icp', 'contracts'].forEach(m => {
    localStorage.removeItem(getStorageKey(userId, m as any));
  });
};

export const clearClassifySession = (userId: string) => localStorage.removeItem(getStorageKey(userId, 'classify'));
export const clearIcpSession = (userId: string) => localStorage.removeItem(getStorageKey(userId, 'icp'));
export const clearContractsSession = (userId: string) => localStorage.removeItem(getStorageKey(userId, 'contracts'));

export const clearEverything = () => {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('glosilex_')) {
      localStorage.removeItem(key);
    }
  });
};
