import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';
import { REDACTED, createRedactor } from '../src/redact.js';

// A fake token — the real one never appears in tests.
const SECRET = 'fake_test_token_ABC123-xyz';

describe('createRedactor', () => {
  const redact = createRedactor([SECRET]);

  it('replaces every occurrence of a known secret', () => {
    expect(redact(`a ${SECRET} b ${SECRET}`)).toBe(`a ${REDACTED} b ${REDACTED}`);
  });

  it('redacts token query parameters even for unknown values', () => {
    expect(redact('GET https://api.example.com/x?page=1&token=whatever123&b=2')).toBe(
      `GET https://api.example.com/x?page=1&token=${REDACTED}&b=2`,
    );
    expect(redact('https://x.io/?access_token=abc')).toBe(`https://x.io/?access_token=${REDACTED}`);
  });

  it('redacts Bearer credentials', () => {
    expect(redact('Authorization: Bearer some.jwt-value')).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it('redacts secrets inside errors (message and cause) and objects', () => {
    const err = new Error(`request to ?token=${SECRET} failed`, { cause: new Error(`inner ${SECRET}`) });
    const out = redact(err);
    expect(out).not.toContain(SECRET);
    expect(out).toContain('Error: request to');
    expect(redact({ headers: { authorization: `Bearer ${SECRET}` } })).not.toContain(SECRET);
  });

  it('ignores empty/undefined secrets', () => {
    const r = createRedactor([undefined, '']);
    expect(r('nothing to hide')).toBe('nothing to hide');
  });
});

describe('createLogger', () => {
  it('never writes the secret, in the message or the extra payload', () => {
    const lines: string[] = [];
    const logger = createLogger(createRedactor([SECRET]), (l) => lines.push(l));
    logger.info(`url=https://api.pandascore.co/csgo/matches?token=${SECRET}`);
    logger.error('failed', new Error(`boom ${SECRET}`));
    expect(lines).toHaveLength(2);
    expect(lines.join('')).not.toContain(SECRET);
    expect(lines[0]).toMatch(/INFO/);
  });
});
