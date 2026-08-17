import {
  LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT,
  LEGAL_NOTICE_PUBLISHED_AT,
  PRIVACY_VERSION,
  TERMS_VERSION,
  legalAcceptanceStatus,
  materialLegalChangeIsInForce,
  needsLegalReacceptance,
} from './legal';

describe('legal acceptance versions', () => {
  it('exports matching Terms and Privacy version stamps', () => {
    expect(TERMS_VERSION).toBe('2026-08-16.1');
    expect(PRIVACY_VERSION).toBe('2026-08-16.1');
    expect(LEGAL_NOTICE_PUBLISHED_AT).toBe('2026-08-16');
    expect(LEGAL_MATERIAL_CHANGE_EFFECTIVE_AT).toBe('2026-09-15');
  });

  it('does not require reacceptance while notice period is open', () => {
    const before = new Date('2026-09-14T23:59:59.000Z');
    expect(materialLegalChangeIsInForce(before)).toBe(false);
    expect(
      needsLegalReacceptance({
        termsVersion: '2026-08-14.4',
        privacyVersion: '2026-08-15.2',
        now: before,
      })
    ).toBe(false);
    const status = legalAcceptanceStatus({
      termsVersion: '2026-08-14.4',
      privacyVersion: '2026-08-15.2',
      now: before,
    });
    expect(status.pendingNotice).toBe(true);
    expect(status.requiresReacceptance).toBe(false);
    expect(status.current).toBe(false);
  });

  it('requires reacceptance after effective date when versions are stale', () => {
    const after = new Date('2026-09-15T00:00:00.000Z');
    expect(materialLegalChangeIsInForce(after)).toBe(true);
    expect(
      needsLegalReacceptance({
        termsVersion: '2026-08-14.4',
        privacyVersion: '2026-08-15.2',
        now: after,
      })
    ).toBe(true);
    const status = legalAcceptanceStatus({
      termsVersion: '2026-08-14.4',
      privacyVersion: '2026-08-15.2',
      now: after,
    });
    expect(status.pendingNotice).toBe(false);
    expect(status.requiresReacceptance).toBe(true);
  });

  it('treats current versions as accepted without a gate', () => {
    const after = new Date('2026-10-01T00:00:00.000Z');
    const status = legalAcceptanceStatus({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      now: after,
    });
    expect(status.current).toBe(true);
    expect(status.pendingNotice).toBe(false);
    expect(status.requiresReacceptance).toBe(false);
  });

  it('does not invent current acceptance for missing version stamps after effective date', () => {
    const after = new Date('2026-09-15T12:00:00.000Z');
    expect(
      needsLegalReacceptance({
        termsVersion: null,
        privacyVersion: null,
        now: after,
      })
    ).toBe(true);
  });
});
