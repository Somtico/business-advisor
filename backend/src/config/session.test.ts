import { getSessionPolicy, publicSessionPolicy } from './session';

describe('session policy', () => {
  const keys = [
    'SESSION_IDLE_MINUTES',
    'SESSION_ABSOLUTE_HOURS',
    'SESSION_WARNING_SECONDS',
    'SESSION_TOUCH_THROTTLE_SECONDS',
    'JWT_EXPIRES_IN',
  ] as const;
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of keys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults to a 15-minute idle timeout and 8-hour absolute cap', () => {
    const policy = getSessionPolicy();
    expect(policy.idleTimeoutMs).toBe(15 * 60 * 1000);
    expect(policy.absoluteTimeoutMs).toBe(8 * 60 * 60 * 1000);
    expect(policy.warningMs).toBe(120 * 1000);
    expect(policy.jwtExpiresIn).toBe('8h');
  });

  it('caps the warning at the idle window', () => {
    process.env.SESSION_IDLE_MINUTES = '1';
    process.env.SESSION_WARNING_SECONDS = '600';
    expect(getSessionPolicy().warningMs).toBe(60 * 1000);
  });

  it('exposes only public timing fields', () => {
    const published = publicSessionPolicy();
    expect(published).toEqual({
      idleTimeoutMs: 15 * 60 * 1000,
      warningMs: 120 * 1000,
      absoluteTimeoutMs: 8 * 60 * 60 * 1000,
    });
  });
});
