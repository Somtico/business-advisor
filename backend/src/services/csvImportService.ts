import prisma from '../config/prisma';

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function dollarsToCents(value: string): number {
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export async function importCsv(params: {
  organizationId: string;
  kind: 'expenses' | 'subscriptions' | 'students' | 'revenue';
  csvText: string;
}): Promise<{ imported: number }> {
  const rows = parseCsv(params.csvText);
  let imported = 0;

  if (params.kind === 'expenses') {
    for (const row of rows) {
      await prisma.expenseTransaction.create({
        data: {
          organizationId: params.organizationId,
          description: row.description || row.name || 'Imported expense',
          category: row.category || undefined,
          amountCents: dollarsToCents(row.amount || row.amount_cad || '0'),
          occurredAt: row.date ? new Date(row.date) : new Date(),
          isRecurring: /true|yes|1/i.test(row.recurring || ''),
          sourceKind: 'CSV',
        },
      });
      imported += 1;
    }
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: params.organizationId, datasetKey: 'expenses' },
      data: { status: 'MANUAL' },
    });
  }

  if (params.kind === 'subscriptions') {
    for (const row of rows) {
      await prisma.recurringSubscription.create({
        data: {
          organizationId: params.organizationId,
          name: row.name || row.subscription || 'Imported subscription',
          amountCents: dollarsToCents(row.amount || '0'),
          cadence: (row.cadence || 'monthly').toLowerCase(),
          category: row.category || undefined,
          nextRenewalAt: row.next_renewal ? new Date(row.next_renewal) : undefined,
          isActive: true,
        },
      });
      imported += 1;
    }
    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: params.organizationId,
        datasetKey: 'subscriptions',
      },
      data: { status: 'MANUAL' },
    });
  }

  if (params.kind === 'students') {
    for (const row of rows) {
      await prisma.person.create({
        data: {
          organizationId: params.organizationId,
          firstName: row.first_name || row.firstname || 'Unknown',
          lastName: row.last_name || row.lastname || '',
          email: row.email || undefined,
          gradeOrAge: row.grade || row.age || undefined,
          status: row.status || 'active',
          startDate: row.start_date ? new Date(row.start_date) : undefined,
        },
      });
      imported += 1;
    }
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: params.organizationId, datasetKey: 'students' },
      data: { status: 'MANUAL' },
    });
  }

  if (params.kind === 'revenue') {
    for (const row of rows) {
      await prisma.revenueTransaction.create({
        data: {
          organizationId: params.organizationId,
          description: row.description || row.name || 'Imported revenue',
          category: row.category || undefined,
          amountCents: dollarsToCents(row.amount || '0'),
          occurredAt: row.date ? new Date(row.date) : new Date(),
          isRecurring: /true|yes|1/i.test(row.recurring || ''),
          sourceKind: 'CSV',
        },
      });
      imported += 1;
    }
    await prisma.dataReadinessItem.updateMany({
      where: { organizationId: params.organizationId, datasetKey: 'revenue' },
      data: { status: 'MANUAL' },
    });
  }

  return { imported };
}
