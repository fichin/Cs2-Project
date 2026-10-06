export const REDACTED = '[REDACTED]';

export type Redactor = (input: unknown) => string;

function stringify(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) {
    const cause = input.cause ? ` (cause: ${stringify(input.cause)})` : '';
    return `${input.name}: ${input.message}${cause}`;
  }
  try {
    return JSON.stringify(input) ?? String(input);
  } catch {
    return String(input);
  }
}

const QUERY_SECRET = /([?&](?:token|access_token|api_key|apikey)=)[^&\s"'#]+/gi;
const BEARER = /(Bearer\s+)[^\s"',]+/gi;

/**
 * Build a function that turns anything into a log-safe string: known secrets are replaced
 * verbatim, plus any token-looking query parameter or Bearer credential as a second line of defence.
 */
export function createRedactor(secrets: Array<string | undefined>): Redactor {
  const known = secrets.filter((s): s is string => typeof s === 'string' && s.length >= 4);
  return (input) => {
    let out = stringify(input);
    for (const secret of known) out = out.split(secret).join(REDACTED);
    out = out.replace(QUERY_SECRET, `$1${REDACTED}`);
    out = out.replace(BEARER, `$1${REDACTED}`);
    return out;
  };
}
