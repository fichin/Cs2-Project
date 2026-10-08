import { describe, expect, it } from 'vitest';
import { checkWsUrl } from './wsUrlCheck';

describe('checkWsUrl (production build guard)', () => {
  it('fails the build on a deploy host when VITE_WS_URL is missing or blank', () => {
    expect(checkWsUrl({ VERCEL: '1' })).toMatchObject({ level: 'error', message: /VITE_WS_URL is not set/ });
    expect(checkWsUrl({ NETLIFY: 'true', VITE_WS_URL: '  ' }).level).toBe('error');
  });

  it('only warns when VITE_WS_URL is missing outside a deploy host (CI, local builds)', () => {
    expect(checkWsUrl({})).toMatchObject({ level: 'warn', message: /VITE_WS_URL is not set/ });
  });

  it('rejects URLs that are not ws:// or wss://', () => {
    expect(checkWsUrl({ VITE_WS_URL: 'https://server.example/ws' }).level).toBe('error');
  });

  it('rejects ws:// on a deploy host (https pages block it) but allows it elsewhere', () => {
    expect(checkWsUrl({ VERCEL: '1', VITE_WS_URL: 'ws://server.example/ws' }).level).toBe('error');
    expect(checkWsUrl({ VITE_WS_URL: 'ws://localhost:3001/ws' }).level).toBe('ok');
  });

  it('accepts a wss:// URL on a deploy host', () => {
    expect(checkWsUrl({ VERCEL: '1', VITE_WS_URL: 'wss://esports-live.onrender.com/ws' })).toEqual({
      level: 'ok',
      message: 'WebSocket URL: wss://esports-live.onrender.com/ws',
    });
  });
});
