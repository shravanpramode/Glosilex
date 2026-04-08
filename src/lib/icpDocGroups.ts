export const ICP_COMPONENT_GROUPS = [
  {
    component: 'Management Commitment',
    criticality: 'Foundational' as const,
    bisRef: 'BIS EMCP §1',
    keywords: ['policy statement', 'compliance policy', 'export policy', 'management policy'],
    dependencyNote: undefined,
  },
  {
    component: 'ECO Appointment',
    criticality: 'Foundational' as const,
    bisRef: 'BIS EMCP §1 / EAR §758',
    keywords: ['export control officer', 'eco designation', 'officer designation', 'eco record'],
    dependencyNote: undefined,
  },
  {
    component: 'Product Classification',
    criticality: 'Foundational' as const,
    bisRef: 'BIS EMCP §3 / EAR §774',
    keywords: ['classification procedure', 'classification register', 'pcr', 'product classif'],
    dependencyNote: 'Procedures must be finalized before the Register can be maintained',
  },
  {
    component: 'Customer & End-User Screening',
    criticality: 'Foundational' as const,
    bisRef: 'BIS EMCP §3 / EAR §744',
    keywords: ['customer screening', 'end-user screening', 'end user screening', 'customer & end'],
    dependencyNote: undefined,
  },
  {
    component: 'Transaction Screening & Red Flag Review',
    criticality: 'Operational' as const,
    bisRef: 'BIS EMCP §2 / EAR Part 732 Suppl. 3',
    keywords: ['transaction screening', 'red flag', 'transaction review'],
    dependencyNote: undefined,
  },
  {
    component: 'License Determination',
    criticality: 'Foundational' as const,
    bisRef: 'BIS EMCP §3 / EAR §730',
    keywords: ['license determination', 'ldc', 'determination checklist', 'licence determination'],
    dependencyNote: undefined,
  },
  {
    component: 'License Application & Tracking',
    criticality: 'Operational' as const,
    bisRef: 'BIS EMCP §3 / EAR §748',
    keywords: ['license application', 'license tracking', 'ltr', 'tracking register', 'licence application'],
    dependencyNote: 'Tracking Procedures must precede Register creation',
  },
  {
    component: 'Recordkeeping',
    criticality: 'Foundational' as const,
    bisRef: 'EAR §762 (min. 5 years)',
    keywords: ['recordkeeping', 'record keeping', 'record retention', 'record-keeping'],
    dependencyNote: undefined,
  },
  {
    component: 'Employee Training',
    criticality: 'Operational' as const,
    bisRef: 'BIS EMCP §5 / DGFT HBP 2023 Ch.10',
    keywords: ['training program', 'training records', 'employee training', 'training programme'],
    dependencyNote: 'Training Program must exist before Records can be maintained',
  },
  {
    component: 'Auditing & Monitoring',
    criticality: 'Governance' as const,
    bisRef: 'BIS EMCP §6',
    keywords: ['internal audit', 'external audit', 'audit report', 'monitoring procedure', 'auditing'],
    dependencyNote: 'Internal procedures precede external; Reports are produced after audits occur',
  },
  {
    component: 'Violation Reporting & Escalation',
    criticality: 'Governance' as const,
    bisRef: 'BIS EMCP §7 / EAR §764',
    keywords: ['violation reporting', 'escalation procedure', 'violation escalation'],
    dependencyNote: undefined,
  },
  {
    component: 'Third-Party & Intermediary Controls',
    criticality: 'Operational' as const,
    bisRef: 'BIS EMCP §2 / EAR §758.3',
    keywords: ['third-party', 'third party', 'intermediary', 'compliance agreement template'],
    dependencyNote: undefined,
  },
  {
    component: 'Technology Transfer & Deemed Exports',
    criticality: 'Operational' as const,
    bisRef: 'BIS EMCP §2 / EAR §734.13',
    keywords: ['technology transfer', 'deemed export', 'tech transfer'],
    dependencyNote: undefined,
  },
  {
    component: 'Sanctions & Entity List Screening',
    criticality: 'Foundational' as const,
    bisRef: 'EAR Part 744 / OFAC / SCOMET List',
    keywords: ['sanctions', 'entity list', 'sanctions screening', 'entity screening'],
    dependencyNote: undefined,
  },
];

export const CRITICALITY_CONFIG = {
  Foundational: {
    dot: 'bg-red-400',
    badge: 'bg-red-50 text-red-700 border-red-200',
  },
  Operational: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  Governance: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
};

export function matchGroupDocs<T extends { label: string }>(
  group: typeof ICP_COMPONENT_GROUPS[0],
  docFlow: T[]
): T[] {
  return docFlow.filter(d =>
    group.keywords.some(k => d.label.toLowerCase().includes(k.toLowerCase()))
  );
}


export interface DocFlowStep {
  stepNumber: number;
  label: string;
  type: 'Policy' | 'Procedure' | 'Record' | 'Form';
  jurisdictionTags: string[];
}

export const STATIC_DOC_FLOW: DocFlowStep[] = [
  { stepNumber: 1,  label: 'Export Compliance Policy Statement',                    type: 'Policy',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 2,  label: 'Export Control Officer (ECO) Designation Record',       type: 'Record',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 3,  label: 'Product Classification Procedures',                     type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 4,  label: 'Product Classification Register (PCR)',                 type: 'Record',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 5,  label: 'Customer & End-User Screening Procedures',              type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 6,  label: 'Transaction Screening & Red Flag Review Procedures',    type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 7,  label: 'License Determination Checklist (LDC)',                 type: 'Form',      jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 8,  label: 'License Application & Tracking Procedures',             type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 9,  label: 'License Tracking Register (LTR)',                       type: 'Record',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 10, label: 'Recordkeeping Policy',                                  type: 'Policy',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 11, label: 'Employee Export Control Training Program',              type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 12, label: 'Employee Training Records',                             type: 'Record',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 13, label: 'Internal Auditing & Monitoring Procedures',             type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 14, label: 'External Audit Procedures',                             type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 15, label: 'Audit Reports',                                         type: 'Record',    jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 16, label: 'Violation Reporting & Escalation Procedure',            type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 17, label: 'Third-Party Export Compliance Agreement Template',      type: 'Form',      jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 18, label: 'Technology Transfer & Deemed Export Control Procedures',type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
  { stepNumber: 19, label: 'Sanctions & Entity List Screening Procedures',          type: 'Procedure', jurisdictionTags: ['SCOMET', 'EAR'] },
];
