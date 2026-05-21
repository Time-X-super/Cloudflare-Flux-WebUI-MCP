// test/index.spec.ts
//
// 不再依赖 @cloudflare/vitest-pool-workers / cloudflare:test —— 该 pool 在当前
// 沙箱内无法启动 workerd（即便补全 libatomic 后，封装的 AI 绑定仍然解析失败：
// `__WRANGLER_EXTERNAL_AI_WORKER`）。改用纯 Node 环境跑 vitest，env.AI 通过
// vi.fn() 手动桩化，覆盖 FLUX.2 多模型分发与 multipart 构造。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const TOKEN = 'Hsue8p20snchw734ambncMD';
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

type RunFn = ReturnType<typeof vi.fn>;
interface FakeEnv {
	AI: { run: RunFn };
}

const makeEnv = (impl?: (model: string, opts: any) => any): FakeEnv => ({
	AI: {
		run: vi.fn(impl ?? (async () => ({ image: 'AAAA' }))),
	},
});

const ctx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
} as unknown as ExecutionContext;

const callWorker = (env: FakeEnv, init: RequestInit) =>
	worker.fetch(new Request('https://example.com', init), env as unknown as never, ctx);

describe('cf-flux-schnell worker (FLUX.2 multi-model)', () => {
	let env: FakeEnv;

	beforeEach(() => {
		env = makeEnv();
	});

	it('GET returns 405', async () => {
		const response = await callWorker(env, { method: 'GET' });
		expect(response.status).toBe(405);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST without bearer returns 401', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt: 'hello' }),
		});
		expect(response.status).toBe(401);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('OPTIONS preflight returns 200 with CORS headers', async () => {
		const response = await callWorker(env, { method: 'OPTIONS' });
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
	});

	it('POST with valid body returns 200, default model, and a multipart payload', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'a sunset at the alps' }),
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as { image: string };
		expect(json.image).toBe('data:image/png;base64,AAAA');

		expect(env.AI.run).toHaveBeenCalledTimes(1);
		const [model, opts] = env.AI.run.mock.calls[0] as [string, any];
		expect(model).toBe(DEFAULT_MODEL);
		expect(opts).toBeDefined();
		expect(opts.multipart).toBeDefined();
		expect(typeof opts.multipart.contentType).toBe('string');
		expect(opts.multipart.contentType.startsWith('multipart/form-data')).toBe(true);

		// drain the body stream and check the form field names appear (substring checks only)
		const buf = await new Response(opts.multipart.body).arrayBuffer();
		const text = new TextDecoder().decode(new Uint8Array(buf));
		expect(text).toContain('name="prompt"');
		expect(text).toContain('name="width"');
		expect(text).toContain('name="height"');
		expect(text).toContain('name="steps"');
		// default values should be serialized as strings
		expect(text).toContain('a sunset at the alps');
		expect(text).toContain('1024');
	});

	it('POST with model=flux-2-dev and steps=20 dispatches to that model', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({
				prompt: 'a forest',
				model: '@cf/black-forest-labs/flux-2-dev',
				steps: 20,
			}),
		});

		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledTimes(1);
		const [model, opts] = env.AI.run.mock.calls[0] as [string, any];
		expect(model).toBe('@cf/black-forest-labs/flux-2-dev');
		const text = new TextDecoder().decode(new Uint8Array(await new Response(opts.multipart.body).arrayBuffer()));
		expect(text).toContain('20');
	});

	it('POST with model=flux-2-klein-4b and steps=20 returns 400 (out of range)', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({
				prompt: 'a forest',
				model: '@cf/black-forest-labs/flux-2-klein-4b',
				steps: 20,
			}),
		});
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST with width=300 (not multiple of 32) returns 400', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'x', width: 300 }),
		});
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST with empty prompt returns 400', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: '' }),
		});
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});
});
