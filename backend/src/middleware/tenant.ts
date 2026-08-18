import { Request, Response, NextFunction } from 'express';
import { Organization, OrganizationEntitlement } from '@prisma/client';
import prisma from '../config/prisma';

export type OrgWithEntitlement = Organization & {
  entitlement: OrganizationEntitlement | null;
};

declare global {
  namespace Express {
    interface Request {
      organization?: OrgWithEntitlement;
      tenantSlug?: string;
      /** True when the slug came from the request Host subdomain, not a client header. */
      tenantFromHost?: boolean;
    }
  }
}

function extractSlugFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  const root = (process.env.ROOT_DOMAIN || 'businessadvisor.app').toLowerCase();
  if (hostname === root || hostname === `www.${root}`) return null;
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (sub && !sub.includes('.')) return sub;
  }
  return null;
}

export async function resolveTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let slug = extractSlugFromHost(req.headers.host);
    const fromHost = Boolean(slug);

    if (!slug && typeof req.query.slug === 'string') {
      slug = req.query.slug;
    }

    if (
      !slug &&
      process.env.ALLOW_TENANT_HEADER === 'true' &&
      typeof req.headers['x-tenant-slug'] === 'string'
    ) {
      slug = req.headers['x-tenant-slug'];
    }

    if (!slug) {
      next();
      return;
    }

    slug = slug.toLowerCase().trim();
    req.tenantSlug = slug;
    req.tenantFromHost = fromHost;

    const organization = await prisma.organization.findUnique({
      where: { slug },
      include: { entitlement: true },
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: `Unknown organization: ${slug}` },
      });
      return;
    }

    req.organization = organization;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.organization) {
    res.status(400).json({
      success: false,
      error: {
        code: 'TENANT_REQUIRED',
        message:
          'Organization context required. Use subdomain, X-Tenant-Slug, or ?slug=',
      },
    });
    return;
  }
  next();
}
