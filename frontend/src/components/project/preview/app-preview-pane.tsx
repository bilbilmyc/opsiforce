import { t } from '~/i18n';
import { toast } from 'solid-sonner';
import { copyText } from '~/lib/copy-text';
import { publicDomain, publicScheme } from '~/lib/public-url';
import { Show, createEffect, createSignal, on, onMount, type JSX } from 'solid-js';
import { Check, Copy, ExternalLink, LoaderCircle, PanelRightClose, Pencil, RefreshCw } from '~/components/icons';
import { ToolbarButton } from '~/components/ui/toolbar-button';
import { appPublicUrl } from '~/lib/app-url';
import { usePermissions } from '~/api/permissions';
import { Permission } from '~/constants/permissions';
import { useProjectEnvironments } from '~/api/environments';
import { EditAppDialog } from '../edit-app-dialog';

export interface AppPreviewPaneProps {
  projectId: string;
  environmentId: string;
  environmentSlug: string | null;
  appName?: string;
  switcher?: JSX.Element;
  onCollapse: () => void;
  onReloadRef?: (reload: () => void) => void;
}

export function AppPreviewPane(props: AppPreviewPaneProps) {
  const [iframeLoading, setIframeLoading] = createSignal(true);
  const [copied, setCopied] = createSignal(false);
  const [editAppOpen, setEditAppOpen] = createSignal(false);

  const { hasPermission } = usePermissions();
  const canEditAppDetails = () => hasPermission(Permission.editAppDetails);
  const environments = useProjectEnvironments(() => props.projectId, { enabled: canEditAppDetails });
  const activeEnv = () => environments.data?.find((e) => e.id === props.environmentId);
  const showEditAction = () => canEditAppDetails() && activeEnv()?.hasApp === true;

  const previewDomain = publicDomain('preview.apps');
  const previewUrl = () => `${publicScheme()}://${props.environmentId}.${previewDomain}/`;
  const publicUrl = () => appPublicUrl(props.environmentId, props.environmentSlug);

  createEffect(
    on(
      () => props.environmentId,
      () => setIframeLoading(true)
    )
  );

  function reload() {
    const iframe = document.getElementById('webapp-preview') as HTMLIFrameElement | null;
    if (!iframe) return;
    setIframeLoading(true);
    // oxlint-disable-next-line no-self-assign -- reassigning src forces the iframe to reload
    iframe.src = iframe.src;
  }

  async function copyUrl() {
    try {
      await copyText(publicUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('Could not copy. Select the app URL and copy it manually.'));
    }
  }

  onMount(() => props.onReloadRef?.(reload));

  return (
    <>
      <div class="h-8 flex items-center gap-2 px-1.5 bg-sidebar border-b border-border shrink-0">
        <div class="flex flex-1 min-w-0 items-center gap-1">
          <ToolbarButton onClick={props.onCollapse} tooltip={t("Close panel")}>
            <PanelRightClose class="w-3.5 h-3.5" />
          </ToolbarButton>
          <span class="text-xs font-medium text-muted-foreground truncate">
            {activeEnv()?.appName || props.appName || t("App")}
          </span>
          <Show when={showEditAction()}>
            <ToolbarButton onClick={() => setEditAppOpen(true)} tooltip={t("Edit app details")}>
              <Pencil class="w-3 h-3" />
            </ToolbarButton>
          </Show>
          <Show when={iframeLoading()}>
            <LoaderCircle class="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
          </Show>
        </div>
        {props.switcher}
        <div class="flex items-center shrink-0 gap-1">
          <a href={publicUrl()} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ExternalLink class="w-3.5 h-3.5" />{t('Open app')}
          </a>
          <ToolbarButton onClick={copyUrl} tooltip={copied() ? t("Copied!") : t("Copy URL")}>
            {copied() ? <Check class="w-3.5 h-3.5 text-green-500" /> : <Copy class="w-3.5 h-3.5" />}
          </ToolbarButton>
          <ToolbarButton onClick={reload} tooltip={t("Reload app")}>
            <RefreshCw class="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      </div>
      <div class="flex items-center gap-2 border-b border-border bg-sidebar px-2 py-1.5 shrink-0">
        <label for={`app-url-${props.environmentId}`} class="shrink-0 text-xs text-muted-foreground">{t('App URL')}</label>
        <input id={`app-url-${props.environmentId}`} aria-label={t('App URL')} type="text" readonly value={publicUrl()} onFocus={event => event.currentTarget.select()}
          class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div class="flex-1 min-h-0">
        <iframe
          id="webapp-preview"
          src={previewUrl()}
          title={t("App preview")}
          class="w-full h-full border-0"
          allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen; autoplay; display-capture; web-share"
          onLoad={() => setIframeLoading(false)}
          onError={() => setIframeLoading(false)}
        />
      </div>
      <EditAppDialog
        projectId={props.projectId}
        environmentId={props.environmentId}
        open={editAppOpen()}
        onOpenChange={setEditAppOpen}
        initialName={activeEnv()?.appName ?? props.appName ?? null}
        initialDescription={activeEnv()?.appDescription ?? null}
      />
    </>
  );
}
