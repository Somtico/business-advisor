/**
 * Provider-boundary PII minimization for Advisor inference.
 *
 * Application data → this module → Anthropic/OpenAI.
 * Separate from Help Improve Advisor / cross-customer learning consent.
 *
 * Request-scoped aliases only. Do not log or persist identity → alias maps.
 */

export type PiiMinimizationStats = {
  aliasesCreated: number;
  emailsRemoved: number;
  phonesRemoved: number;
  addressesGeneralized: number;
  idsPseudonymized: number;
  dobsGeneralized: number;
  namesPseudonymized: number;
};

export type MinimizedProviderContext = {
  question: string;
  toolResults: Record<string, unknown>;
  stats: PiiMinimizationStats;
};

export type PersonRole =
  | 'Instructor'
  | 'Student'
  | 'Parent'
  | 'Staff'
  | 'Employee'
  | 'Customer'
  | 'Administrator'
  | 'Owner'
  | 'Person';

type AliasRegistry = {
  /** Normalized full name → alias */
  byName: Map<string, string>;
  /** Raw id → alias */
  byId: Map<string, string>;
  counters: Record<PersonRole, number>;
  idCounters: Record<string, number>;
};

const EMAIL_RE =
  /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g;

const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

const CANADIAN_POSTAL_RE = /\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/g;

/** "123 Privacy Test Street" / "123 Example St." */
const STREET_ADDRESS_RE =
  /\b\d{1,5}\s+[A-Za-z0-9][A-Za-z0-9'.\-]*(?:\s+[A-Za-z0-9'.\-]*){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Court|Ct\.?|Way|Place|Pl\.?|Terrace|Trail|Crescent|Cres\.?)\b/gi;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

/** Field keys whose string values are personal names (role inferred from key). */
const NAME_FIELD_ROLES: Array<{ match: RegExp; role: PersonRole }> = [
  { match: /instructor/i, role: 'Instructor' },
  { match: /staff/i, role: 'Staff' },
  { match: /employee/i, role: 'Employee' },
  { match: /student|child|learner|pupil/i, role: 'Student' },
  { match: /parent|guardian|household/i, role: 'Parent' },
  { match: /customer|client/i, role: 'Customer' },
  { match: /owner/i, role: 'Owner' },
  { match: /admin/i, role: 'Administrator' },
  {
    match:
      /^(fullName|displayName|personName|contactName|memberName|userName)$/i,
    role: 'Person',
  },
  { match: /^(firstName|lastName|givenName|familyName|surname)$/i, role: 'Person' },
];

const EMAIL_FIELDS = /email|e-mail/i;
const PHONE_FIELDS = /phone|mobile|cell|fax|sms/i;
const ADDRESS_FIELDS =
  /^(address|street|streetAddress|addressLine\d*|homeAddress|mailingAddress|residentialAddress)$/i;
const POSTAL_FIELDS = /postalCode|zipCode|zip$/i;
const DOB_FIELDS = /^(dateOfBirth|dob|birthDate|birthdate)$/i;
const ID_FIELDS =
  /^(personId|studentId|staffMemberId|staffId|userId|householdId|instructorId|employeeId|parentId|guardianId|customerId)$/i;

/** Object keys where a child `name` is a business label, not a person. */
const BUSINESS_NAME_PARENT_KEYS = new Set([
  'programmes',
  'programme',
  'programs',
  'program',
  'products',
  'product',
  'subscriptions',
  'subscription',
  'locations',
  'location',
  'centres',
  'centers',
  'categories',
  'category',
  'actions',
  'tacticsTried',
  'cheapNextSteps',
  'peerPatterns',
]);

const PRESERVE_NAME_FIELDS = new Set([
  'programmeName',
  'programName',
  'productName',
  'serviceName',
  'className',
  'courseName',
  'locationName',
  'centreName',
  'centerName',
  'organizationName',
  'leakLabel',
  'label',
  'title',
  'verdict',
  'status',
  'tacticKey',
  'metricKey',
  'category',
  'roleTitle',
  'impactType',
  'source',
  'outcome',
  'costBand',
  'leakType',
  'leakTypeAtReport',
  'method',
]);

function emptyStats(): PiiMinimizationStats {
  return {
    aliasesCreated: 0,
    emailsRemoved: 0,
    phonesRemoved: 0,
    addressesGeneralized: 0,
    idsPseudonymized: 0,
    dobsGeneralized: 0,
    namesPseudonymized: 0,
  };
}

function createRegistry(): AliasRegistry {
  return {
    byName: new Map(),
    byId: new Map(),
    counters: {
      Instructor: 0,
      Student: 0,
      Parent: 0,
      Staff: 0,
      Employee: 0,
      Customer: 0,
      Administrator: 0,
      Owner: 0,
      Person: 0,
    },
    idCounters: {},
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function nextAlias(registry: AliasRegistry, role: PersonRole): string {
  registry.counters[role] += 1;
  const letter = String.fromCharCode(64 + registry.counters[role]); // A, B, …
  return `${role} ${letter}`;
}

function aliasForName(
  registry: AliasRegistry,
  stats: PiiMinimizationStats,
  name: string,
  role: PersonRole
): string {
  const key = normalizeName(name);
  if (!key || key.length < 2) return name;
  const existing = registry.byName.get(key);
  if (existing) return existing;
  const alias = nextAlias(registry, role);
  registry.byName.set(key, alias);
  stats.aliasesCreated += 1;
  stats.namesPseudonymized += 1;
  return alias;
}

function aliasForId(
  registry: AliasRegistry,
  stats: PiiMinimizationStats,
  id: string,
  kind: string
): string {
  const existing = registry.byId.get(id);
  if (existing) return existing;
  const counterKey = kind || 'Ref';
  registry.idCounters[counterKey] = (registry.idCounters[counterKey] || 0) + 1;
  const n = registry.idCounters[counterKey];
  const alias = `${counterKey} ${n}`;
  registry.byId.set(id, alias);
  stats.aliasesCreated += 1;
  stats.idsPseudonymized += 1;
  return alias;
}

function roleFromFieldKey(key: string): PersonRole | null {
  for (const { match, role } of NAME_FIELD_ROLES) {
    if (match.test(key)) return role;
  }
  return null;
}

function ageFromIsoDate(value: string, asOf = new Date()): string | null {
  const m = ISO_DATE_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > asOf.getFullYear()) return null;
  let age = asOf.getFullYear() - y;
  const hadBirthday =
    asOf.getMonth() + 1 > mo ||
    (asOf.getMonth() + 1 === mo && asOf.getDate() >= d);
  if (!hadBirthday) age -= 1;
  if (age < 0 || age > 120) return null;
  return `Age ${age}`;
}

function scrubFreeText(
  text: string,
  registry: AliasRegistry,
  stats: PiiMinimizationStats
): string {
  let out = text;

  out = out.replace(EMAIL_RE, () => {
    stats.emailsRemoved += 1;
    return '[email removed]';
  });

  out = out.replace(PHONE_RE, () => {
    stats.phonesRemoved += 1;
    return '[phone removed]';
  });

  out = out.replace(STREET_ADDRESS_RE, () => {
    stats.addressesGeneralized += 1;
    return '[street address removed]';
  });

  out = out.replace(CANADIAN_POSTAL_RE, () => {
    stats.addressesGeneralized += 1;
    return '[postal code removed]';
  });

  // Longest names first so "Jane Smith" wins over partial tokens.
  const names = [...registry.byName.entries()].sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [norm, alias] of names) {
    // Rebuild a case-insensitive regex from the normalized name
    const parts = norm.split(' ').map((p) =>
      p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    if (parts.length === 0) continue;
    const pattern = new RegExp(`\\b${parts.join('\\s+')}\\b`, 'gi');
    out = out.replace(pattern, alias);
  }

  return out;
}

function combinePersonName(
  obj: Record<string, unknown>
): { full: string; role: PersonRole } | null {
  const first =
    typeof obj.firstName === 'string' ? obj.firstName.trim() : '';
  const last = typeof obj.lastName === 'string' ? obj.lastName.trim() : '';
  if (!first && !last) return null;
  const full = [first, last].filter(Boolean).join(' ');
  let role: PersonRole = 'Person';
  if (typeof obj.roleTitle === 'string' && /instructor|teacher|coach/i.test(obj.roleTitle)) {
    role = 'Instructor';
  }
  return { full, role };
}

function shouldPreserveBusinessName(
  key: string,
  parentKey: string | null
): boolean {
  if (PRESERVE_NAME_FIELDS.has(key)) return true;
  if (key === 'name' && parentKey && BUSINESS_NAME_PARENT_KEYS.has(parentKey)) {
    return true;
  }
  return false;
}

function minimizeValue(
  value: unknown,
  key: string | null,
  parentKey: string | null,
  registry: AliasRegistry,
  stats: PiiMinimizationStats,
  path: string[]
): unknown {
  if (value == null) return value;

  if (Array.isArray(value)) {
    const childParent = key || parentKey;
    return value.map((item, i) =>
      minimizeValue(item, null, childParent, registry, stats, [
        ...path,
        String(i),
      ])
    );
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    // Prefer one alias for firstName+lastName so relationships stay intact.
    const combined = combinePersonName(obj);
    let combinedAlias: string | null = null;
    if (combined) {
      let role = combined.role;
      if (key && /instructor|staff|employee|student|parent|person/i.test(key)) {
        role =
          roleFromFieldKey(key) ||
          (/instructor/i.test(key)
            ? 'Instructor'
            : /student/i.test(key)
              ? 'Student'
              : /parent|household/i.test(key)
                ? 'Parent'
                : /staff|employee/i.test(key)
                  ? 'Staff'
                  : role);
      }
      combinedAlias = aliasForName(registry, stats, combined.full, role);
    }

    for (const [k, v] of Object.entries(obj)) {
      if (combinedAlias && (k === 'firstName' || k === 'lastName')) {
        out[k] = k === 'firstName' ? combinedAlias : '';
        continue;
      }
      out[k] = minimizeValue(v, k, key, registry, stats, [...path, k]);
    }
    return out;
  }

  if (typeof value !== 'string') return value;

  const field = key || '';

  if (EMAIL_FIELDS.test(field)) {
    stats.emailsRemoved += 1;
    return '[email removed]';
  }

  if (PHONE_FIELDS.test(field)) {
    stats.phonesRemoved += 1;
    return '[phone removed]';
  }

  if (ADDRESS_FIELDS.test(field)) {
    stats.addressesGeneralized += 1;
    // Keep city/region-only strings; strip street-like values.
    if (STREET_ADDRESS_RE.test(value) || /\d/.test(value)) {
      STREET_ADDRESS_RE.lastIndex = 0;
      return '[street address removed]';
    }
    return scrubFreeText(value, registry, stats);
  }

  if (POSTAL_FIELDS.test(field)) {
    stats.addressesGeneralized += 1;
    return '[postal code removed]';
  }

  if (DOB_FIELDS.test(field)) {
    const age = ageFromIsoDate(value);
    stats.dobsGeneralized += 1;
    return age || '[date of birth removed]';
  }

  if (ID_FIELDS.test(field) && value.length > 0) {
    const kind = field.replace(/Id$/i, '') || 'Ref';
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    return aliasForId(registry, stats, value, label);
  }

  if (shouldPreserveBusinessName(field, parentKey)) {
    return scrubFreeText(value, registry, stats);
  }

  const nameRole = roleFromFieldKey(field);
  if (nameRole && value.trim().length >= 2 && !/^\d+$/.test(value.trim())) {
    // Avoid treating programme-like single tokens in instructor fields incorrectly —
    // still alias when the field itself declares a person role.
    const alias = aliasForName(registry, stats, value, nameRole);
    return alias;
  }

  // Generic `name` under a person-ish parent path
  if (
    field === 'name' &&
    parentKey &&
    /staff|person|people|student|instructor|employee|member|user|customer/i.test(
      parentKey
    )
  ) {
    return aliasForName(registry, stats, value, 'Person');
  }

  if (field === 'name' && shouldPreserveBusinessName(field, parentKey)) {
    return scrubFreeText(value, registry, stats);
  }

  // Free-form / unknown string fields
  return scrubFreeText(value, registry, stats);
}

/**
 * Minimize question text + structured tool results for provider inference.
 * Aliases are request-scoped and discarded when this function returns
 * (only stats leave the function; the name→alias map does not).
 */
export function minimizeForProviderInference(input: {
  question: string;
  toolResults: Record<string, unknown>;
}): MinimizedProviderContext {
  const registry = createRegistry();
  const stats = emptyStats();

  // Pass 1: walk structured data so names are registered before question scrub.
  const minimizedTools = minimizeValue(
    input.toolResults,
    null,
    null,
    registry,
    stats,
    []
  ) as Record<string, unknown>;

  const minimizedQuestion = scrubFreeText(input.question, registry, stats);

  // Drop registry references — callers must not receive the identity map.
  registry.byName.clear();
  registry.byId.clear();

  return {
    question: minimizedQuestion,
    toolResults: minimizedTools,
    stats,
  };
}

/**
 * Assert known fixture PII strings are absent from a provider-bound payload.
 * Used by invariant tests; safe for production too (returns missing list).
 */
export function findLeakedFixturePii(
  providerBoundText: string,
  fixtures: string[]
): string[] {
  const lower = providerBoundText.toLowerCase();
  return fixtures.filter((f) => lower.includes(f.toLowerCase()));
}
