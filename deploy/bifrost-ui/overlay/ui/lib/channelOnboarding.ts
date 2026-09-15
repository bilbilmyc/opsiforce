import { z } from "zod";

export const channelTemplates = {
	custom: { label: "其他渠道 / 中转服务", baseUrl: "", name: "", example: "填写渠道提供的准确模型 ID" },
	kimi: { label: "Kimi 官方（国内）", baseUrl: "https://api.moonshot.cn/v1", name: "kimi-main", example: "kimi-k3" },
	minimax: { label: "MiniMax 官方（国内）", baseUrl: "https://api.minimaxi.com/v1", name: "minimax-main", example: "MiniMax-M2.7" },
	deepseek: { label: "DeepSeek 官方", baseUrl: "https://api.deepseek.com/v1", name: "deepseek-main", example: "deepseek-flash" },
};
export function parseChannelModels(value: string): string[] {
	return [
		...new Set(
			value
				.split(/[\n,，]+/)
				.map((v) => v.trim())
				.filter(Boolean),
		),
	];
}
export const channelOnboardingSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "请填写渠道名称")
		.max(50, "渠道名称最多 50 个字符")
		.regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "渠道名称请使用字母、数字、短横线或下划线"),
	baseUrl: z
		.string()
		.trim()
		.url("请填写完整的 http 或 https 地址")
		.superRefine((value, ctx) => {
			try {
				const url = new URL(value);
				if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
					ctx.addIssue({ code: "custom", message: "地址只能使用 http 或 https，不能包含密钥、查询参数或片段" });
				if (/\/(chat\/completions|responses|messages|models)\/?$/.test(url.pathname))
					ctx.addIssue({ code: "custom", message: "请填写接口基础地址（通常以 /v1 结尾），不要包含 /chat/completions 等具体接口路径" });
			} catch {
				/* The URL validator reports malformed URLs. */
			}
		}),
	apiKey: z.string().trim().min(1, "请填写此渠道的 API 密钥"),
	models: z.string().superRefine((value, ctx) => {
		const models = parseChannelModels(value);
		if (!models.length || models.length > 100 || models.some((m) => m.length > 255 || /\s/.test(m) || m === "*"))
			ctx.addIssue({ code: "custom", message: "请填写 1 至 100 个准确模型 ID，每行一个；不要填写空格或星号" });
	}),
	enabled: z.boolean(),
});
export type ChannelOnboardingValues = z.infer<typeof channelOnboardingSchema>;
// Explicitly disable unneeded endpoints instead of inheriting the gateway's broad defaults.
export const chatOnlyRequests = {
	list_models: false,
	chat_completion: true,
	chat_completion_stream: true,
	text_completion: false,
	text_completion_stream: false,
	responses: false,
	responses_stream: false,
	responses_retrieve: false,
	responses_delete: false,
	responses_cancel: false,
	responses_input_items: false,
	embedding: false,
	speech: false,
	speech_stream: false,
	transcription: false,
	transcription_stream: false,
	image_generation: false,
	image_generation_stream: false,
	image_edit: false,
	image_edit_stream: false,
	image_variation: false,
	count_tokens: false,
	rerank: false,
	ocr: false,
	ocr_stream: false,
	video_generation: false,
	video_retrieve: false,
	video_download: false,
	video_delete: false,
	video_list: false,
	video_remix: false,
	websocket_responses: false,
	realtime: false,
};