/**
 * Cloudflare Worker: FLUX.2 多模型文本生图代理
 *
 * 支持的模型：
 *   - @cf/black-forest-labs/flux-2-klein-4b（默认）
 *   - @cf/black-forest-labs/flux-2-klein-9b
 *   - @cf/black-forest-labs/flux-2-dev
 *
 * 所有 FLUX.2 模型必须通过 multipart/form-data 调用：
 *   env.AI.run(model, { multipart: { body, contentType } })
 *
 * 学习更多: https://developers.cloudflare.com/workers/
 */

import { z } from 'zod';
import { ApiError, MethodNotAllowedError, ValidationError } from './errors';

/**
 * 认证令牌
 */
const FLUX_TOKEN = 'Hsue8p20snchw734ambncMD';

/**
 * 支持的 FLUX.2 模型 ID 列表
 */
const FLUX2_MODELS = [
	'@cf/black-forest-labs/flux-2-klein-4b',
	'@cf/black-forest-labs/flux-2-klein-9b',
	'@cf/black-forest-labs/flux-2-dev',
] as const;

type FluxModelId = (typeof FLUX2_MODELS)[number];

/**
 * 默认模型
 */
const DEFAULT_MODEL: FluxModelId = '@cf/black-forest-labs/flux-2-klein-4b';

/**
 * 各模型的 steps 范围与默认值
 *   - klein-4b / klein-9b：蒸馏模型，1-8 步即可，默认 4
 *   - flux-2-dev：标准模型，1-50 步，默认 25
 */
const MODEL_CONFIG: Record<FluxModelId, { defaultSteps: number; minSteps: number; maxSteps: number }> = {
	'@cf/black-forest-labs/flux-2-klein-4b': { defaultSteps: 4, minSteps: 1, maxSteps: 8 },
	'@cf/black-forest-labs/flux-2-klein-9b': { defaultSteps: 4, minSteps: 1, maxSteps: 8 },
	'@cf/black-forest-labs/flux-2-dev': { defaultSteps: 25, minSteps: 1, maxSteps: 50 },
};

/**
 * 环境变量接口
 */
export interface Env {
	AI: Ai;
}

/**
 * 生成图像响应接口
 */
interface GenerateImageResponse {
	image: string;
}

/**
 * 未授权错误
 */
class UnauthorizedError extends ApiError {
	constructor() {
		super(401, '未授权访问');
		this.name = 'UnauthorizedError';
	}
}

/**
 * 生成图像请求验证 Schema
 *
 * 接受字段：
 *   - prompt:  必填，1-2048 字符
 *   - model:   可选，FLUX.2 三种模型之一，默认 flux-2-klein-4b
 *   - width:   可选，256-2048 之间且为 32 的倍数的整数，默认 1024
 *   - height:  可选，256-2048 之间且为 32 的倍数的整数，默认 1024
 *   - steps:   可选，整数；具体范围由所选模型决定，省略时按模型默认值填充
 */
const GenerateImageSchema = z
	.object({
		prompt: z.string().min(1, '提示不能为空').max(2048, '提示值不得超过2048个字符'),
		model: z.enum(FLUX2_MODELS).optional().default(DEFAULT_MODEL),
		width: z
			.number()
			.int()
			.min(256)
			.max(2048)
			.multipleOf(32, 'width 必须为 32 的倍数')
			.optional()
			.default(1024),
		height: z
			.number()
			.int()
			.min(256)
			.max(2048)
			.multipleOf(32, 'height 必须为 32 的倍数')
			.optional()
			.default(1024),
		steps: z.number().int().min(1).max(50).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.steps === undefined) return;
		const cfg = MODEL_CONFIG[data.model];
		if (data.steps < cfg.minSteps || data.steps > cfg.maxSteps) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['steps'],
				message: `steps 必须在 ${cfg.minSteps} 与 ${cfg.maxSteps} 之间（模型 ${data.model}）`,
			});
		}
	})
	.transform((data) => ({
		...data,
		steps: data.steps ?? MODEL_CONFIG[data.model].defaultSteps,
	}));

/**
 * 创建JSON响应
 */
const createJsonResponse = (data: unknown, status = 200): Response => {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
};

/**
 * 处理错误
 */
const handleError = (error: unknown): Response => {
	console.error('处理请求时出错:', error);

	if (error instanceof ApiError) {
		return createJsonResponse(
			{
				error: error.message,
				details: error.details ? error.details : undefined,
			},
			error.status
		);
	}

	return createJsonResponse(
		{
			error: '内部服务器错误',
			details: error instanceof Error ? error.message : '未知错误',
		},
		500
	);
};

/**
 * 验证请求
 */
const validateRequest = async (request: Request): Promise<z.infer<typeof GenerateImageSchema>> => {
	if (request.method !== 'POST') {
		throw new MethodNotAllowedError();
	}

	// 验证Authorization头
	const authHeader = request.headers.get('Authorization');
	const expectedToken = `Bearer ${FLUX_TOKEN}`;

	if (!authHeader || authHeader !== expectedToken) {
		throw new UnauthorizedError();
	}

	try {
		const body = await request.json();
		return GenerateImageSchema.parse(body);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError(error);
		}
		throw new ApiError(400, '请求正文无效');
	}
};

/**
 * 主处理程序
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// 设置CORS
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		// 处理预检请求
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: corsHeaders,
			});
		}

		try {
			const validated = await validateRequest(request);

			// 构建 multipart/form-data 请求体（FLUX.2 系列模型的统一调用方式）
			const form = new FormData();
			form.append('prompt', validated.prompt);
			form.append('width', String(validated.width));
			form.append('height', String(validated.height));
			form.append('steps', String(validated.steps));

			const formResp = new Response(form);
			const contentType = formResp.headers.get('content-type');
			if (!formResp.body || !contentType) {
				throw new ApiError(500, '无法构建多部分请求体');
			}

			// FLUX.2 模型尚未进入 @cloudflare/workers-types，按官方多部分调用契约转发
			const aiRun = env.AI.run as unknown as (
				model: FluxModelId,
				inputs: { multipart: { body: ReadableStream; contentType: string } }
			) => Promise<{ image?: string }>;

			const response = await aiRun(validated.model, {
				multipart: {
					body: formResp.body,
					contentType,
				},
			});

			const result: GenerateImageResponse = {
				image: response.image ? `data:image/png;base64,${response.image}` : '',
			};

			return new Response(JSON.stringify(result), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json',
				},
			});
		} catch (error) {
			const errorResponse = handleError(error);

			// 添加CORS头到错误响应
			const errorHeaders = new Headers(errorResponse.headers);
			Object.entries(corsHeaders).forEach(([key, value]) => {
				errorHeaders.set(key, value);
			});

			return new Response(errorResponse.body, {
				status: errorResponse.status,
				headers: errorHeaders,
			});
		}
	},
} satisfies ExportedHandler<Env>;
