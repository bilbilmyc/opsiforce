import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

export function ModelCatalogEmptyState() {
	return (
		<div className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="text-muted-foreground">
				<LayoutGrid className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">尚未配置模型渠道</h1>
				<div className="text-muted-foreground mx-auto mt-2 max-w-[600px] text-sm font-normal">
					先添加一个模型渠道，即可查看模型及调用情况。
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button asChild data-testid="modelcatalog-configure-providers-cta">
						<Link to="/workspace/providers">添加模型渠道</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}