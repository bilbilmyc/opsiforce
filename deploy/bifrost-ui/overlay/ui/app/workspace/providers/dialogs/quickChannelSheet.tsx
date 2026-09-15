import { v4 as uuid } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { channelTemplates, chatOnlyRequests, parseChannelModels, type ChannelOnboardingValues } from "@/lib/channelOnboarding";
import { channelOnboardingSchema } from "@/lib/types/schemas";
import { readCapabilities, writeCapabilities } from "@/lib/modelCapabilities";
import {
	useCreateProviderMutation,
	useCreateProviderKeyMutation,
	useUpdateProviderKeyMutation,
	useUpsertModelCatalogEntriesMutation,
	useGetProvidersQuery,
} from "@/lib/store";
import { ModelProviderName } from "@/lib/types/config";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";

type Props = { show: boolean; onClose: () => void; onSave: (name: string) => void };
export default function QuickChannelSheet(props: Props) {
	return props.show ? <QuickChannelForm {...props} /> : null;
}
function QuickChannelForm({ onClose, onSave }: Props) {
	const allowed = useRbac(RbacResource.ModelProvider, RbacOperation.Create);
	const { data: providers = [] } = useGetProvidersQuery();
	const [createProvider] = useCreateProviderMutation();
	const [createKey] = useCreateProviderKeyMutation();
	const [updateKey] = useUpdateProviderKeyMutation();
	const [saveModels] = useUpsertModelCatalogEntriesMutation();
	const [template, setTemplate] = useState<keyof typeof channelTemplates>("custom");
	const [created, setCreated] = useState(false);
	const [keyCreated, setKeyCreated] = useState(false);
	const [keyId] = useState(() => uuid());
	const [error, setError] = useState("");
	const [stage, setStage] = useState("");
	const form = useForm<ChannelOnboardingValues>({
		resolver: zodResolver(channelOnboardingSchema),
		defaultValues: { name: "", baseUrl: "", apiKey: "", models: "", enabled: true },
	});
	const busy = form.formState.isSubmitting;
	const submit = form.handleSubmit(async (value) => {
		if (!allowed) {
			setError("当前账号没有新增渠道的权限");
			return;
		}
		if (!created && providers.some((p) => p.name === value.name)) {
			form.setError("name", { message: "这个渠道名称已存在，请换一个名称，或在原渠道中增加密钥" });
			return;
		}
		const provider = value.name as ModelProviderName;
		const models = parseChannelModels(value.models);
		const key = {
			id: keyId,
			name: `${provider}-默认密钥`,
			value: { value: value.apiKey, ref: "" },
			models,
			blacklisted_models: [],
			weight: 1,
			enabled: false,
		};
		setError("");
		let currentStage = "创建渠道";
		try {
			setStage(currentStage);
			if (!created) {
				await createProvider({
					provider,
					custom_provider_config: { base_provider_type: "openai", is_key_less: false, allowed_requests: chatOnlyRequests },
					network_config: {
						base_url: value.baseUrl.replace(/\/+$/, ""),
						default_request_timeout_in_seconds: 600,
						max_retries: 0,
						retry_backoff_initial: 500,
						retry_backoff_max: 5000,
						allow_private_network: false,
					},
				}).unwrap();
				setCreated(true);
			}
			currentStage = "保存密钥";
			setStage(currentStage);
			if (!keyCreated) {
				await createKey({ provider, key }).unwrap();
				setKeyCreated(true);
			}
			currentStage = "保存模型配置";
			setStage(currentStage);
			await saveModels(
				models.map((model) => ({
					provider,
					model,
					additional_attributes: writeCapabilities({}, readCapabilities({ provider, name: model })),
				})),
			).unwrap();
			currentStage = "启用渠道";
			setStage(currentStage);
			await updateKey({ provider, keyId, key: { ...key, enabled: value.enabled } }).unwrap();
			form.reset();
			onSave(value.name);
		} catch (cause) {
			const status = typeof cause === "object" && cause !== null && "status" in cause ? String(cause.status) : "";
			setError(
				`${currentStage}失败${status ? `（${status}）` : ""}。请检查地址和权限后重试。已完成的步骤会保留；密钥在全部完成前保持停用。若关闭窗口，可在渠道列表继续编辑。`,
			);
		} finally {
			setStage("");
		}
	});
	const fields = [
		{ name: "name", label: "渠道名称", placeholder: "例如 kimi-main，同一服务可以添加多个渠道" },
		{ name: "baseUrl", label: "接口基础地址", placeholder: "https://你的渠道地址/v1" },
		{ name: "apiKey", label: "API 密钥", placeholder: "粘贴这个渠道提供的密钥" },
		{ name: "models", label: "模型 ID（每行一个）", placeholder: channelTemplates[template].example },
	] as const;
	return (
		<Sheet
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<SheetContent
				className="flex w-full flex-col overflow-y-auto sm:max-w-xl"
				data-testid="quick-channel-sheet"
				onInteractOutside={(e) => {
					if (busy || form.formState.isDirty || created) e.preventDefault();
				}}
			>
				<SheetHeader>
					<SheetTitle>新增模型渠道</SheetTitle>
					<SheetDescription>选择接入模板，填写密钥和模型。地址、密钥及模型统一保存在 Bifrost。</SheetDescription>
				</SheetHeader>
				<form onSubmit={submit} className="space-y-5 px-5 pb-5">
					<label className="block space-y-2">
						<span>接入模板</span>
						<select
							aria-label="接入模板"
							data-testid="channel-template"
							className="border-input bg-background w-full rounded border p-2"
							disabled={busy || created}
							value={template}
							onChange={(e) => {
								const next = e.target.value as keyof typeof channelTemplates;
								setTemplate(next);
								form.setValue("baseUrl", channelTemplates[next].baseUrl);
								form.setValue("name", channelTemplates[next].name);
								form.setValue("models", next === "custom" ? "" : channelTemplates[next].example);
							}}
						>
							{Object.entries(channelTemplates).map(([key, value]) => (
								<option key={key} value={key}>
									{value.label}
								</option>
							))}
						</select>
					</label>
					<p className="text-muted-foreground text-xs">
						官方模板用于对应地区的官方 API 密钥。中转服务请选“其他渠道”，使用中转服务自己的地址和密钥。当前向导使用 OpenAI 兼容的对话接口。
					</p>
					{fields.map((field) => (
						<div className="space-y-2" key={field.name}>
							<label htmlFor={`channel-${field.name}`}>{field.label}</label>
							{field.name === "models" ? (
								<Textarea
									id={`channel-${field.name}`}
									data-testid={`channel-${field.name}`}
									placeholder={field.placeholder}
									disabled={busy || created}
									{...form.register(field.name)}
								/>
							) : (
								<Input
									id={`channel-${field.name}`}
									data-testid={`channel-${field.name}`}
									type={field.name === "apiKey" ? "password" : "text"}
									autoComplete="off"
									placeholder={field.placeholder}
									disabled={busy || (created && field.name !== "apiKey") || (keyCreated && field.name === "apiKey")}
									{...form.register(field.name)}
								/>
							)}
							{form.formState.errors[field.name] && (
								<p role="alert" className="text-xs text-red-600">
									{form.formState.errors[field.name]?.message}
								</p>
							)}
						</div>
					))}
					<label className="flex items-center gap-2">
						<input type="checkbox" data-testid="channel-enabled" disabled={busy} {...form.register("enabled")} />
						完成后启用渠道
					</label>
					<div className="bg-muted/30 rounded border p-3 text-sm leading-6">
						会自动绑定填写的模型，只开启对话和流式对话接口。模型能力优先使用内置模板，未知模型先填入 128K 上下文 / 64K
						最大输出；完成后请在“模型管理”核对能力开关。保存成功不代表上游连通性验证通过。
					</div>
					{created && <p className="text-xs">渠道已创建，重试会继续剩余步骤。</p>}
					{error && (
						<p role="alert" className="text-sm text-red-600">
							{error}
						</p>
					)}
					<div className="bg-background sticky bottom-0 flex justify-end gap-2 border-t py-3">
						<Button type="button" variant="outline" onClick={onClose} disabled={busy}>
							取消
						</Button>
						<Button type="submit" data-testid="channel-submit" disabled={!allowed || busy}>
							{busy ? stage + "…" : created ? "继续完成配置" : "创建渠道并配置模型"}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}