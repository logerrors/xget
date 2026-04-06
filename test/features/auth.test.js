import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../../src/index.js';

/** @type {ExecutionContext} */
const executionContext = {
  waitUntil() {},
  passThroughOnException() {}
};

describe('Authentication Header Forwarding', () => {
  /** @type {{ match: ReturnType<typeof vi.fn>, put: ReturnType<typeof vi.fn> }} */
  let cacheDefault;

  beforeEach(() => {
    cacheDefault = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined)
    };

    vi.stubGlobal('caches', { default: cacheDefault });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards Authorization for authenticated file requests and disables caching', async () => {
    const authToken = 'Bearer ghp_test_token_12345';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    );

    const response = await worker.fetch(
      new Request('https://example.com/gh/test/private-repo/README.md', {
        method: 'HEAD',
        headers: {
          Authorization: authToken
        }
      }),
      {},
      executionContext
    );

    expect(response.status).toBe(200);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('Authorization')).toBe(authToken);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('forwards Authorization for Hugging Face API passthrough requests', async () => {
    const authToken = 'Bearer hf_test_token_12345';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const response = await worker.fetch(
      new Request('https://example.com/hf/api/models/test-private-model', {
        method: 'GET',
        headers: {
          Authorization: authToken
        }
      }),
      {},
      executionContext
    );

    expect(response.status).toBe(200);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('Authorization')).toBe(authToken);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
  });

  it('forwards Authorization for authenticated PyPI index requests', async () => {
    const authToken = 'Basic dGVzdDp0ZXN0MTIzNDU=';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    );

    const response = await worker.fetch(
      new Request('https://example.com/pypi/simple/private-package/', {
        method: 'HEAD',
        headers: {
          Authorization: authToken
        }
      }),
      {},
      executionContext
    );

    expect(response.status).toBe(200);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('Authorization')).toBe(authToken);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('forwards Authorization for gated Hugging Face model downloads', async () => {
    const authToken = 'Bearer hf_authenticated_token';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const response = await worker.fetch(
      new Request('https://example.com/hf/meta-llama/Llama-2-7b/resolve/main/config.json', {
        headers: {
          Authorization: authToken
        }
      }),
      {},
      executionContext
    );

    expect(response.status).toBe(200);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('Authorization')).toBe(authToken);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
    // HF requests use protocol passthrough — proxy does not inject Cache-Control
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it('follows HuggingFace 307 resolve-cache redirects with a fresh direct request', async () => {
    const resolvedBody = JSON.stringify({ model_type: 'whisper' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        // First call: HF resolve endpoint returns 307 to resolve-cache
        new Response('redirect target', {
          status: 307,
          headers: {
            Location: '/api/resolve-cache/models/openai/whisper-large-v3/abc123/config.json'
          }
        })
      )
      .mockResolvedValueOnce(
        // Second call: fresh direct request to resolve-cache returns 200
        new Response(resolvedBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(resolvedBody.length)
          }
        })
      );

    const response = await worker.fetch(
      new Request('https://example.com/hf/openai/whisper-large-v3/resolve/main/config.json'),
      {},
      executionContext
    );

    expect(response.status).toBe(200);
    // First fetch: to HF resolve endpoint (with redirect: 'manual')
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Second fetch: fresh direct request to resolved absolute URL
    const secondCallUrl = fetchSpy.mock.calls[1][0].toString();
    expect(secondCallUrl).toContain('api/resolve-cache');
    expect(secondCallUrl).toContain('huggingface.co');
  });
});
