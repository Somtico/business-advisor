export const EDUCATION_SUBTYPE_OPTIONS = [
  { value: 'STEM_ACADEMY', label: 'STEM Academy' },
  { value: 'TUTORING_CENTRE', label: 'Tutoring Centre' },
  { value: 'MUSIC_ART_SCHOOL', label: 'Music / Art School' },
  { value: 'LANGUAGE_SCHOOL', label: 'Language School' },
  { value: 'SPORTS_SKILLS_ACADEMY', label: 'Sports / Skills Academy' },
  { value: 'CAMP_ENRICHMENT', label: 'Camp / Enrichment Provider' },
  { value: 'MIXED_PROGRAMME_CENTRE', label: 'Mixed Programme Centre' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type EducationSubtypeValue =
  (typeof EDUCATION_SUBTYPE_OPTIONS)[number]['value'];

/** URL-safe slug from a business / organization name. */
export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function RequiredMark() {
  return (
    <span className="text-ba-warm" aria-hidden="true">
      {' '}
      *
    </span>
  );
}
