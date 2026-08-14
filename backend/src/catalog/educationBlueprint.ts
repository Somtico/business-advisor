import { DataSourceStatus, EducationSubtype } from '@prisma/client';

export const AFTER_SCHOOL_BLUEPRINT_KEY = 'after_school_tutoring_enrichment';

export interface BlueprintDataset {
  datasetKey: string;
  label: string;
  whyItMatters: string;
  exampleInsight: string;
  priority: number;
  defaultStatus?: DataSourceStatus;
}

export const EDUCATION_DATASETS: BlueprintDataset[] = [
  {
    datasetKey: 'students',
    label: 'Students / Learners',
    whyItMatters:
      'Tracks unique learners so you can measure growth, retention, and household value.',
    exampleInsight:
      'You have 13 active paid coding students versus a year-end target of 25.',
    priority: 100,
  },
  {
    datasetKey: 'enrolments',
    label: 'Enrolments',
    whyItMatters:
      'Enrolment start/end dates power historical active counts, churn, and forecasts.',
    exampleInsight:
      'Three enrolments ended last month while only one started — retention risk.',
    priority: 95,
  },
  {
    datasetKey: 'programmes',
    label: 'Programmes / Classes',
    whyItMatters:
      'Programme mix shows which offerings grow, shrink, or stay under-capacity.',
    exampleInsight: 'Robotics evenings run at 40% capacity while coding saturates.',
    priority: 90,
  },
  {
    datasetKey: 'trials',
    label: 'Trials / Leads',
    whyItMatters:
      'Trial-to-paid conversion shows whether marketing spend becomes tuition.',
    exampleInsight: 'Trial conversion fell from 45% to 28% this quarter.',
    priority: 85,
  },
  {
    datasetKey: 'sessions_capacity',
    label: 'Sessions and Capacity',
    whyItMatters:
      'Compares rostered demand with seats and rooms to find wasted capacity.',
    exampleInsight: 'Tuesday 4pm has 4 seats empty while Saturday is waitlisted.',
    priority: 80,
  },
  {
    datasetKey: 'staffing',
    label: 'Staff and Schedules',
    whyItMatters:
      'Staffing-versus-demand analysis estimates labour cost you can reduce.',
    exampleInsight:
      'Two instructors scheduled for a 3-student class — estimated $180/week excess.',
    priority: 88,
  },
  {
    datasetKey: 'wages',
    label: 'Wage Assumptions',
    whyItMatters:
      'Hourly/salary rates turn schedule hours into labour cost forecasts.',
    exampleInsight: 'Projected instructor labour this month is $4,200.',
    priority: 75,
  },
  {
    datasetKey: 'expenses',
    label: 'Operating Expenses',
    whyItMatters: 'Shows where operating cost rose and what is avoidable.',
    exampleInsight: 'Software and supplies rose 18% versus last quarter.',
    priority: 70,
  },
  {
    datasetKey: 'subscriptions',
    label: 'Recurring Software / Vendors',
    whyItMatters:
      'Surfaces subscriptions to review before renewal, especially unused tools.',
    exampleInsight: 'Three tools renew in 14 days with overlapping features.',
    priority: 72,
  },
  {
    datasetKey: 'loans_cash',
    label: 'Loans and Cash Balance',
    whyItMatters: 'Supports basic cash runway and shortfall warnings.',
    exampleInsight: 'At current burn, cash covers about 6 weeks of fixed costs.',
    priority: 65,
  },
  {
    datasetKey: 'targets',
    label: 'Academic-Year Targets',
    whyItMatters:
      'Targets turn dashboards into scorecards: on track, at risk, or ahead.',
    exampleInsight:
      'At current enrolment velocity you miss the June student target by 6.',
    priority: 92,
  },
  {
    datasetKey: 'revenue',
    label: 'Tuition / Revenue',
    whyItMatters: 'Links programmes and enrolments to cash and margin outlook.',
    exampleInsight: 'Recurring tuition covers 82% of fixed monthly costs.',
    priority: 78,
  },
];

export const EDUCATION_LABELS = {
  customer: 'Student',
  customers: 'Students',
  service: 'Programme',
  services: 'Programmes',
  staff: 'Instructor',
  engagement: 'Enrolment',
  engagements: 'Enrolments',
};

export function subtypeLabel(subtype: EducationSubtype): string {
  switch (subtype) {
    case 'STEM_CODING_ACADEMY':
      return 'STEM / Coding Academy';
    case 'TUTORING_CENTRE':
      return 'Tutoring Centre';
    case 'MUSIC_ART_SCHOOL':
      return 'Music / Art School';
    case 'LANGUAGE_SCHOOL':
      return 'Language School';
    case 'SPORTS_SKILLS_ACADEMY':
      return 'Sports / Skills Academy';
    case 'CAMP_ENRICHMENT':
      return 'Camp / Enrichment Provider';
    case 'MIXED_PROGRAMME_CENTRE':
      return 'Mixed Programme Centre';
    default:
      return subtype;
  }
}
