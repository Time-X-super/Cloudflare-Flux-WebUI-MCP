// test/index.spec.ts
//
// 不再依赖 @cloudflare/vitest-pool-workers / cloudflare:test —— 该 pool 在当前
// 沙箱内无法启动 workerd（即便补全 libatomic 后，封装的 AI 绑定仍然解析失败：
// `__WRANGLER_EXTERNAL_AI_WORKER`）。改用纯 Node 环境跑 vitest，env.AI 通过
// vi.fn() 手动桩化，覆盖 FLUX.2 多模型分发与 multipart 构造。
//
// 注意（保真度降级）：脱离 vitest-pool-workers 后，本套件不再通过真实的
// workerd 运行 Worker，也无法验证 Workers AI 绑定的实际调用形态、wrangler
// 打包后的 CORS / 鉴权链路或 multipart body 在绑定内部的具体处理方式。在
// 部署前请使用 `wrangler dev` 跑一次冒烟测试，至少覆盖：
//   1. 默认模型 + 默认尺寸的成功路径，确认绑定接受 Uint8Array multipart；
//   2. flux-2-dev 与 klein-9b 至少各跑一次；
//   3. 401 / 405 / OPTIONS 预检返回符合预期。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const TOKEN = 'test-token';
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

type RunFn = ReturnType<typeof vi.fn>;
interface FakeEnv {
	AI: { run: RunFn };
	FLUX_TOKEN: string;
}

interface MakeEnvOptions {
	impl?: (model: string, opts: any) => any;
	token?: string;
}

const makeEnv = (options: MakeEnvOptions = {}): FakeEnv => ({
	AI: {
		run: vi.fn(options.impl ?? (async () => ({ image: 'AAAA' }))),
	},
	FLUX_TOKEN: options.token === undefined ? TOKEN : options.token,
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

	it('POST with malformed bearer returns 401', async () => {
		// 证明鉴权检查的是值相等，而非仅判断 Authorization 头是否存在
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer wrong-token',
			},
			body: JSON.stringify({ prompt: 'hello' }),
		});
		expect(response.status).toBe(401);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST that triggers env.AI.run rejection returns 500 with CORS headers', async () => {
		const failingEnv = makeEnv({
			impl: async () => {
				throw new Error('upstream AI failure');
			},
		});
		const response = await callWorker(failingEnv, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'a forest' }),
		});
		expect(response.status).toBe(500);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		const json = (await response.json()) as { error: string; details?: string };
		expect(json.error).toBeTruthy();
		expect(json.details).toContain('upstream AI failure');
		expect(failingEnv.AI.run).toHaveBeenCalledTimes(1);
	});

	it('POST with height=300 (not multiple of 32) returns 400', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'x', height: 300 }),
		});
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST with model=flux-2-klein-9b dispatches to that model', async () => {
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({
				prompt: 'a tower',
				model: '@cf/black-forest-labs/flux-2-klein-9b',
				steps: 6,
			}),
		});
		expect(response.status).toBe(200);
		expect(env.AI.run).toHaveBeenCalledTimes(1);
		const [model] = env.AI.run.mock.calls[0] as [string, any];
		expect(model).toBe('@cf/black-forest-labs/flux-2-klein-9b');
	});

	it('POST with the legacy flux-1-schnell model id returns 400', async () => {
		// 防止有人把旧 schnell id 误重新加进枚举
		const response = await callWorker(env, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({
				prompt: 'a forest',
				model: '@cf/black-forest-labs/flux-1-schnell',
			}),
		});
		expect(response.status).toBe(400);
		expect(env.AI.run).not.toHaveBeenCalled();
	});

	it('POST when env.FLUX_TOKEN is empty returns 503 with operator hint and CORS headers', async () => {
		const missingEnv = makeEnv({ token: '' });
		const response = await callWorker(missingEnv, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'hello' }),
		});

		expect(response.status).toBe(503);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		const json = (await response.json()) as { error: string };
		expect(json.error).toContain('wrangler secret put FLUX_TOKEN');
		expect(missingEnv.AI.run).not.toHaveBeenCalled();
	});

	it('POST when env.FLUX_TOKEN is undefined returns 503 and never invokes AI.run', async () => {
		const undefinedEnv = makeEnv();
		// Simulate Wrangler not injecting the secret at all (different from empty string).
		(undefinedEnv as unknown as { FLUX_TOKEN: string | undefined }).FLUX_TOKEN = undefined;
		const response = await callWorker(undefinedEnv, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'hello' }),
		});

		expect(response.status).toBe(503);
		const json = (await response.json()) as { error: string };
		expect(json.error).toContain('wrangler secret put FLUX_TOKEN');
		expect(undefinedEnv.AI.run).not.toHaveBeenCalled();
	});

	it('POST with a custom env.FLUX_TOKEN value authenticates against that token, not the default', async () => {
		const customEnv = makeEnv({ token: 'another-token' });
		// Bearer matching the original default TOKEN must now be rejected.
		const rejected = await callWorker(customEnv, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ prompt: 'hello' }),
		});
		expect(rejected.status).toBe(401);
		expect(customEnv.AI.run).not.toHaveBeenCalled();

		// Bearer matching the custom secret should pass through to AI.run.
		const accepted = await callWorker(customEnv, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer another-token',
			},
			body: JSON.stringify({ prompt: 'hello' }),
		});
		expect(accepted.status).toBe(200);
		expect(customEnv.AI.run).toHaveBeenCalledTimes(1);
	});
});
