import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdownMenu";
import { ProviderIconType, RenderProviderIcon } from "@/lib/constants/icons";
import { ProviderLabels } from "@/lib/constants/logs";
import { PlusIcon, Settings2Icon } from "lucide-react";

export type ProviderOption = { name: string };

interface AddProviderDropdownProps {
	/** Provider names that are already in the sidebar (configured or added) */
	existingInSidebar: Set<string>;
	/** All known provider options to show (e.g. from ProviderNames / allProviders) */
	knownProviders: ProviderOption[];
	onSelectKnownProvider: (name: string) => void;
	onAddCustomProvider: () => void;
	onQuickChannel: () => void;
	disabled?: boolean;
	/** Optional: use compact trigger for empty state */
	variant?: "default" | "empty";
}

export function AddProviderDropdown({
	existingInSidebar,
	knownProviders,
	onSelectKnownProvider,
	onAddCustomProvider,
	onQuickChannel,
	disabled = false,
	variant = "default",
}: AddProviderDropdownProps) {
	const availableKnown = knownProviders.filter((p) => !existingInSidebar.has(p.name));
	const hasKnown = availableKnown.length > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size={variant === "empty" ? "default" : "sm"}
					data-testid="add-provider-btn"
					className={variant === "empty" ? "" : "w-full justify-start"}
					aria-label="新增渠道"
					disabled={disabled}
				>
					<PlusIcon className="h-4 w-4" />
					{variant === "empty" ? <span>新增渠道</span> : <div className="text-xs">新增渠道</div>}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="custom-scrollbar max-h-[min(70vh,24rem)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
				data-testid="add-provider-dropdown"
			>
				<DropdownMenuItem onSelect={onQuickChannel} data-testid="quick-channel-entry">
					快速添加（Kimi / MiniMax / DeepSeek / 中转）
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{availableKnown.map((p) => (
					<DropdownMenuItem key={p.name} data-testid={`add-provider-option-${p.name}`} onSelect={() => onSelectKnownProvider(p.name)}>
						<RenderProviderIcon provider={p.name as ProviderIconType} size="sm" className="h-4 w-4" />
						<span>{ProviderLabels[p.name as keyof typeof ProviderLabels] ?? p.name}</span>
					</DropdownMenuItem>
				))}
				{hasKnown && <DropdownMenuSeparator />}
				{/* Add New Provider > Custom provider... — used by E2E (add-provider-option-custom) */}
				<DropdownMenuItem data-testid="add-provider-option-custom" onSelect={onAddCustomProvider}>
					<Settings2Icon className="h-4 w-4" />
					<span>高级自定义渠道…</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}