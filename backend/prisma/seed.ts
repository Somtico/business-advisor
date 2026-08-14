import { PrismaClient } from '@prisma/client';

/**
 * Intentionally empty.
 * Organizations (including STEM Lantern) are created through normal signup/onboarding
 * so the pilot path matches any future customer.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('No demo tenants seeded. Create an organization via /signup.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
