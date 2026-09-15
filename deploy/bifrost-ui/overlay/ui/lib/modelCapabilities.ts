import { z } from "zod";

export const capabilityFields = [
	{ key: "context", label: "上下文总容量", hint: "模型一次能处理的全部内容，包括历史对话、工具结果和回答。", required: true },
	{
		key: "maxOutput",
		label: "最大回答长度",
		hint: "模型允许的输出上限；实际每次使用多少，在 Opsiforce 的运行策略中设置。",
		required: true,
	},
	{ key: "maxInput", label: "最大输入长度", hint: "渠道没有单独限制时可以留空。", required: false },
] as const;
export const effortLabels: Record<string, string> = {
	minimal: "最低",
	low: "低",
	medium: "中",
	high: "高",
	max: "最高",
	xhigh: "极高",
	none: "关闭思考",
};
export const capabilityKeys = [
	"context",
	"maxOutput",
	"maxInput",
	"tools",
	"streaming",
	"reasoningAccounting",
	"reasoningEfforts",
	"maxTokensField",
	"source",
	"vision",
] as const;
export type CapabilityDraft = Record<(typeof capabilityKeys)[number], string>;
export type CapabilityModel = {
	name: string;
	provider: string;
	additional_attributes?: Record<string, string>;
	context_length?: number;
	max_input_tokens?: number;
	max_output_tokens?: number;
	supports_function_calling?: boolean;
	supports_streaming?: boolean;
	supports_vision?: boolean;
};
export const blankCapabilities: CapabilityDraft = {
	context: "131072",
	maxOutput: "65536",
	maxInput: "",
	tools: "true",
	streaming: "true",
	reasoningAccounting: "none",
	reasoningEfforts: "[]",
	maxTokensField: "max_tokens",
	source: "通用初始配置，按渠道实际能力调整",
	vision: "false",
};
export function defaultCapabilities(model: CapabilityModel): CapabilityDraft {
	const result = { ...(knownTemplate(model.name) ?? blankCapabilities) };
	const native = {
		context: model.context_length,
		maxOutput: model.max_output_tokens,
		maxInput: model.max_input_tokens,
		tools: model.supports_function_calling,
		streaming: model.supports_streaming,
		vision: model.supports_vision,
	};
	for (const [key, value] of Object.entries(native))
		if (value !== undefined && value !== null) result[key as keyof CapabilityDraft] = String(value);
	// Only clamp an inferred output limit; explicit channel limits remain visible for validation.
	if (model.max_output_tokens == null && Number(result.maxOutput) > Number(result.context)) result.maxOutput = result.context;
	if (Object.values(native).some((value) => value != null))
		result.source = "已优先使用 Bifrost 提供的规格，未提供的项目由模型模板或通用初始值补齐。";
	return result;
}
export function readCapabilities(model: CapabilityModel): CapabilityDraft {
	const result = defaultCapabilities(model);
	for (const key of capabilityKeys)
		if (model.additional_attributes?.[`opsiforce.${key}`] !== undefined) result[key] = model.additional_attributes[`opsiforce.${key}`];
	return result;
}
export function knownTemplate(name: string): CapabilityDraft | undefined {
	if (!["glm-5.3", "glm-5.3-flash"].includes(name)) return;
	return {
		...blankCapabilities,
		context: "1000000",
		vision: name === "glm-5.3-flash" ? "true" : "false",
		maxOutput: "131072",
		tools: "true",
		streaming: "true",
		reasoningAccounting: "shared",
		reasoningEfforts: '["low","high","max"]',
		source: `${name === "glm-5.3" ? "https://docs.z.ai/guides/llm/glm-5.3" : "https://docs.z.ai/guides/vlm/glm-5.3-flash"}；2026-09-15 官方规格，请核对当前渠道限制。`,
	};
}
export const modelCapabilityFormSchema = z
	.object({
		context: z.string(),
		maxOutput: z.string(),
		maxInput: z.string(),
		tools: z.string(),
		streaming: z.string(),
		reasoningAccounting: z.string(),
		reasoningEfforts: z.string(),
		maxTokensField: z.string(),
		source: z.string(),
		vision: z.string(),
	})
	.superRefine((value, ctx) => {
		const error = (key: keyof CapabilityDraft, message: string) => ctx.addIssue({ code: "custom", path: [key], message });
		for (const f of capabilityFields) {
			const raw = value[f.key].trim();
			if (!raw && !f.required) continue;
			if (!raw) error(f.key, `请填写${f.label}，或点击“恢复默认配置”`);
			else if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1 || Number(raw) > 100000000)
				error(f.key, `${f.label}需要填写 1 至 100000000 的整数`);
		}
		if (Number(value.maxOutput) > Number(value.context)) error("maxOutput", "最大回答长度不能超过上下文总容量");
		if (Number(value.maxInput) > Number(value.context)) error("maxInput", "最大输入长度不能超过上下文总容量");
		for (const [key, label] of [
			["tools", "工具调用"],
			["streaming", "流式输出"],
			["vision", "图片输入"],
		] as const)
			if (!["true", "false"].includes(value[key])) error(key, `请选择是否支持${label}`);
		if (!["none", "shared", "separate"].includes(value.reasoningAccounting)) error("reasoningAccounting", "请选择思考与回答的额度关系");
		try {
			const efforts: unknown = JSON.parse(value.reasoningEfforts);
			if (
				!Array.isArray(efforts) ||
				efforts.length > 12 ||
				!efforts.every((v) => typeof v === "string" && v !== "default" && /^[a-z][a-z0-9_-]{0,30}$/.test(v)) ||
				new Set(efforts).size !== efforts.length
			)
				throw new Error();
		} catch {
			error("reasoningEfforts", "思考强度配置无效，请重新勾选或使用模板");
		}
		if (!["max_tokens", "max_completion_tokens"].includes(value.maxTokensField)) error("maxTokensField", "请选择有效的接口格式");
		if (value.source.length > 1000) error("source", "说明不能超过 1000 个字符");
	});
export function writeCapabilities(original: Record<string, string>, draft: CapabilityDraft): Record<string, string> {
	const parsed = modelCapabilityFormSchema.parse(draft);
	const result = { ...original };
	for (const key of capabilityKeys) {
		delete result[`opsiforce.${key}`];
		const value = parsed[key].trim();
		if (value) result[`opsiforce.${key}`] = value;
	}
	return result;
}