import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, ModelDetails, useUpsertModelCatalogEntriesMutation } from "@/lib/store";
import {
	defaultCapabilities,
	capabilityFields,
	effortLabels,
	knownTemplate,
	readCapabilities,
	writeCapabilities,
	type CapabilityDraft,
} from "@/lib/modelCapabilities";
import { modelCapabilityFormSchema } from "@/lib/types/schemas";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";

export type CopiedCapabilityTemplate = { label: string; values: CapabilityDraft };
interface Props {
	model: ModelDetails;
	onClose: () => void;
	copiedTemplate?: CopiedCapabilityTemplate;
	onCopy: (value: CopiedCapabilityTemplate) => void;
}

export default function AttributeSheet({ model, onClose, copiedTemplate, onCopy }: Props) {
	const hasAccess = useRbac(RbacResource.ModelProvider, RbacOperation.Update);
	const [save, { isLoading }] = useUpsertModelCatalogEntriesMutation();
	const [description, setDescription] = useState(model.additional_attributes?.description ?? "");
	const [saveError, setSaveError] = useState("");
	const defaults = defaultCapabilities(model);
	const form = useForm<CapabilityDraft>({
		resolver: zodResolver(modelCapabilityFormSchema),
		defaultValues: readCapabilities(model),
		mode: "onChange",
	});
	const values = form.watch();
	const errors = form.formState.errors;
	const change = (key: keyof CapabilityDraft, value: string) => form.setValue(key, value, { shouldValidate: true, shouldDirty: true });
	const restore = () => {
		form.reset({ ...defaults });
		setSaveError("");
	};
	let efforts: string[] = [];
	try {
		const parsed: unknown = JSON.parse(values.reasoningEfforts);
		if (Array.isArray(parsed)) efforts = parsed.filter((v): v is string => typeof v === "string");
	} catch {
		/* Inline validation explains how to reset malformed legacy values. */
	}
	const availableEfforts = [...new Set([...Object.keys(effortLabels), ...efforts])];
	const effortEnabled = values.reasoningAccounting !== "none";
	const errorFor = (key: keyof CapabilityDraft) =>
		errors[key] && (
			<p role="alert" className="mt-1 text-xs text-red-600">
				{errors[key]?.message}
			</p>
		);
	const submit = form.handleSubmit(async (draft) => {
		if (!hasAccess) {
			setSaveError("当前账号没有修改模型配置的权限");
			return;
		}
		setSaveError("");
		const attrs = writeCapabilities(model.additional_attributes ?? {}, draft);
		if (description.trim()) attrs.description = description.trim();
		else delete attrs.description;
		try {
			await save([{ model: model.name, provider: model.provider, additional_attributes: attrs }]).unwrap();
			toast.success("模型配置已保存，Opsiforce 将自动同步", { position: "top-center" });
			onClose();
		} catch (error) {
			const text = getErrorMessage(error);
			setSaveError(
				text.includes("no pricing row")
					? "此渠道还没有模型目录记录，请联系管理员初始化该渠道后重试。当前填写内容已保留。"
					: "保存失败，请检查连接后重试。" + text,
			);
		}
	});
	return (
		<Sheet
			open
			onOpenChange={(open) => {
				if (!open && !isLoading) onClose();
			}}
		>
			<SheetContent
				className="flex w-full flex-col overflow-y-auto sm:max-w-2xl"
				data-testid="model-catalog-attribute-sheet"
				onInteractOutside={(e) => {
					if (form.formState.isDirty || isLoading) e.preventDefault();
				}}
			>
				<SheetHeader>
					<SheetTitle>模型能力配置</SheetTitle>
					<SheetDescription>已提供默认配置，支持的功能打开，不支持的关闭。保存后应用于此渠道的模型。</SheetDescription>
				</SheetHeader>
				<form onSubmit={submit} className="space-y-5 px-5 pb-5">
					<div className="rounded border p-3 text-sm">
						<span className="text-muted-foreground">当前模型：</span>
						{model.provider} / {model.name}
					</div>
					<section className="bg-muted/20 space-y-3 rounded border p-3">
						<h3 className="text-sm font-medium">配置模板</h3>
						<p className="text-muted-foreground text-xs">
							{knownTemplate(model.name)
								? "已识别此模型，可一键应用官方规格模板。"
								: "通用初始值：上下文 128K、最大回答 64K，工具调用与流式输出开启，图片输入和思考模式关闭。"}{" "}
							Bifrost 已提供的规格优先使用；通用初始值不代表已验证的模型能力。渠道有额外限制时可自行调整。
						</p>
						<div className="flex flex-wrap gap-2">
							<Button type="button" size="sm" variant="outline" onClick={restore} data-testid="capability-reset">
								恢复默认配置
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								data-testid="capability-copy"
								onClick={form.handleSubmit((draft) => {
									onCopy({ label: `${model.provider} / ${model.name}`, values: draft });
									toast.success("已复制此配置，打开其他模型后可直接应用", { position: "top-center" });
								})}
							>
								复制为模板
							</Button>
							{copiedTemplate && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									data-testid="capability-paste"
									onClick={() => {
										form.reset({ ...copiedTemplate.values });
										setSaveError("");
									}}
								>
									应用已复制的模板
								</Button>
							)}
						</div>
						{copiedTemplate && (
							<p className="text-muted-foreground text-xs">已复制：{copiedTemplate.label}。应用后请核对当前渠道支持情况。</p>
						)}
					</section>
					<section className="space-y-4">
						<h3 className="text-sm font-medium">容量配置</h3>
						{capabilityFields
							.filter((f) => f.required)
							.map((field) => (
								<div key={field.key}>
									<label htmlFor={`cap-${field.key}`} className="text-sm font-medium">
										{field.label} <span className="text-muted-foreground">（词元）</span>
									</label>
									<Input
										id={`cap-${field.key}`}
										type="number"
										min={1}
										step={1}
										{...form.register(field.key)}
										onBlur={() => {
											if (!form.getValues(field.key).trim()) change(field.key, defaults[field.key]);
										}}
										placeholder={`留空使用默认值 ${defaults[field.key]}`}
										aria-invalid={!!errors[field.key]}
										data-testid={`capability-${field.key}`}
									/>
									<div className="mt-2 flex flex-wrap gap-2">
										{(field.key === "context" ? [32768, 131072, 262144, 524288, 1000000] : [4096, 8192, 16384, 32768, 65536, 131072]).map(
											(n) => (
												<button
													key={n}
													type="button"
													className="hover:bg-muted rounded border px-2 py-1 text-xs"
													onClick={() => change(field.key, String(n))}
													data-testid={`capability-${field.key}-${n}`}
												>
													{n === 1000000 ? "100 万" : `${n / 1024}K`}
												</button>
											),
										)}
									</div>
									<p className="text-muted-foreground mt-1 text-xs">{field.hint}</p>
									{errorFor(field.key)}
								</div>
							))}
					</section>
					<section className="space-y-3">
						<h3 className="text-sm font-medium">支持的功能</h3>
						{(
							[
								["tools", "工具调用", "允许智能体读取文件、执行命令和修改代码。"],
								["streaming", "流式输出", "回答逐步显示，适用于交互式对话。"],
								["vision", "图片输入", "模型是否能理解对话中附带的图片。"],
							] as const
						).map(([key, label, hint]) => (
							<div key={key} className="flex items-center justify-between gap-4 rounded border p-3">
								<div>
									<label htmlFor={`cap-${key}`} className="text-sm">
										{label}
									</label>
									<p className="text-muted-foreground mt-1 text-xs">{hint}</p>
									{errorFor(key)}
								</div>
								<Controller
									control={form.control}
									name={key}
									render={({ field }) => (
										<Switch
											id={`cap-${key}`}
											checked={field.value === "true"}
											onCheckedChange={(checked) => field.onChange(String(checked))}
											aria-label={label}
											data-testid={`capability-${key}`}
										/>
									)}
								/>
							</div>
						))}
						<div className="flex items-center justify-between gap-4 rounded border p-3">
							<div>
								<label htmlFor="cap-thinking" className="text-sm">
									思考模式
								</label>
								<p className="text-muted-foreground mt-1 text-xs">支持推理的模型可开启；关闭后不发送额外思考强度设置。</p>
							</div>
							<Switch
								id="cap-thinking"
								checked={effortEnabled}
								onCheckedChange={(checked) => {
									change("reasoningAccounting", checked ? "shared" : "none");
									if (!checked) change("reasoningEfforts", "[]");
								}}
								aria-label="思考模式"
								data-testid="capability-thinking"
							/>
						</div>
						{effortEnabled && (
							<div className="rounded border p-3">
								<p className="text-sm">可选思考强度</p>
								<p className="text-muted-foreground mb-2 text-xs">按模型支持情况勾选；全部不选时跟随模型默认行为。</p>
								<div className="flex flex-wrap gap-3">
									{availableEfforts.map((effort) => (
										<label key={effort} className="flex items-center gap-1 text-sm">
											<input
												type="checkbox"
												checked={efforts.includes(effort)}
												onChange={(e) =>
													change(
														"reasoningEfforts",
														JSON.stringify(e.target.checked ? [...efforts, effort] : efforts.filter((v) => v !== effort)),
													)
												}
												data-testid={`capability-effort-${effort}`}
											/>
											{effortLabels[effort] ?? effort}
										</label>
									))}
								</div>
								{errorFor("reasoningEfforts")}
							</div>
						)}
						{(values.tools === "false" || values.streaming === "false") && (
							<p role="status" className="text-sm text-amber-700">
								可以保存此模型，但当前智能体需要工具调用和流式输出，关闭后将无法执行编程任务。
							</p>
						)}
					</section>
					<details className="rounded border p-3">
						<summary className="cursor-pointer text-sm">高级配置（通常无需修改）</summary>
						<div className="mt-3 space-y-3">
							<div>
								<label htmlFor="cap-maxInput" className="text-sm">
									最大输入长度（可留空）
								</label>
								<Input id="cap-maxInput" type="number" min={1} {...form.register("maxInput")} data-testid="capability-maxInput" />
								{errorFor("maxInput")}
							</div>
							<div>
								<label htmlFor="cap-accounting" className="text-sm">
									思考与回答的额度关系
								</label>
								<select
									id="cap-accounting"
									className="bg-background mt-1 w-full rounded border p-2 text-sm"
									{...form.register("reasoningAccounting")}
									data-testid="capability-accounting"
								>
									<option value="none">不单独配置思考</option>
									<option value="shared">思考与回答共用输出额度</option>
									<option value="separate">独立思考额度，需要额外预留上下文</option>
								</select>
								{errorFor("reasoningAccounting")}
								{values.reasoningAccounting === "separate" && (
									<p className="mt-1 text-xs text-amber-700">请同时在 Opsiforce 的运行策略中设置“思考预留长度”，再运行任务。</p>
								)}
							</div>
							<div>
								<label htmlFor="cap-format" className="text-sm">
									输出参数格式
								</label>
								<select
									id="cap-format"
									className="bg-background mt-1 w-full rounded border p-2 text-sm"
									{...form.register("maxTokensField")}
									data-testid="capability-format"
								>
									<option value="max_tokens">标准兼容格式（默认）</option>
									<option value="max_completion_tokens">新版兼容格式</option>
								</select>
								{errorFor("maxTokensField")}
							</div>
							<div>
								<label htmlFor="cap-source" className="text-sm">
									配置依据或备注
								</label>
								<Textarea id="cap-source" {...form.register("source")} data-testid="capability-source" />
								{errorFor("source")}
							</div>
							<p className="text-muted-foreground text-xs">已有的其他自定义属性会保留。</p>
						</div>
					</details>
					<div>
						<label htmlFor="cap-description" className="text-sm">
							模型说明（可选）
						</label>
						<Textarea
							id="cap-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							data-testid="model-catalog-description-textarea"
						/>
					</div>
					{!!Object.keys(errors).length && (
						<div role="alert" className="rounded border border-red-300 p-3 text-sm text-red-600">
							请先修正以下配置：
							{Object.values(errors)
								.map((e) => e.message)
								.join("；")}
						</div>
					)}
					{saveError && (
						<p role="alert" className="text-sm text-red-600">
							{saveError}
						</p>
					)}
					<div className="bg-background sticky bottom-0 flex justify-end gap-2 border-t py-3">
						<Button type="button" variant="outline" disabled={isLoading} onClick={onClose} data-testid="model-catalog-attribute-cancel">
							取消
						</Button>
						<Button type="submit" disabled={isLoading || !hasAccess} data-testid="model-catalog-attribute-submit">
							{isLoading ? "正在保存…" : "保存模型配置"}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}