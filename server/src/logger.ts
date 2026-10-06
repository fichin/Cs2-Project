import type { Redactor } from './redact.js';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

/** Every line goes through the redactor, so a secret can't leak via a logged URL or error. */
export function createLogger(
  redact: Redactor,
  write: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const log = (level: LogLevel, message: string, extra?: unknown) => {
    const suffix = extra === undefined ? '' : ` ${redact(extra)}`;
    write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(message)}${suffix}\n`);
  };
  return {
    info: (m, e) => log('info', m, e),
    warn: (m, e) => log('warn', m, e),
    error: (m, e) => log('error', m, e),
  };
}

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
