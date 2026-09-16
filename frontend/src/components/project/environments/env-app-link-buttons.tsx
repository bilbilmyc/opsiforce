import { t } from '~/i18n';
import { toast } from 'solid-sonner';
import { copyText } from '~/lib/copy-text';
import { createSignal } from 'solid-js';
import { Check, Copy, ExternalLink } from '~/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/cn';

export interface EnvAppLinkButtonsProps {
  appUrl: string;
  enabled: boolean;
  disabledReason: string;
}

export default function EnvAppLinkButtons(props: EnvAppLinkButtonsProps) {
  const [copied, setCopied] = createSignal(false);

  const buttonClass = (extra?: string) =>
    cn(
      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
      props.enabled ? 'hover:bg-accent hover:text-foreground' : 'cursor-default opacity-40',
      extra
    );

  const openApp = () => {
    if (!props.enabled) return;
    window.open(props.appUrl, '_blank', 'noopener,noreferrer');
  };

  const copyUrl = async () => {
    if (!props.enabled) return;
    try {
      await copyText(props.appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('Could not copy. Open the app and copy the address from your browser.'));
    }
  };

  return (
    <span class="flex items-center">
      <Tooltip>
        <TooltipTrigger class={buttonClass()} aria-disabled={!props.enabled} aria-label={t("Open app")} onClick={openApp}>
          <ExternalLink class="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent>{props.enabled ? t("Open app") : props.disabledReason}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          class={buttonClass()}
          aria-disabled={!props.enabled}
          aria-label={t("Copy app URL")}
          onClick={copyUrl}
        >
          {copied() ? <Check class="h-3.5 w-3.5 text-emerald-500" /> : <Copy class="h-3.5 w-3.5" />}
        </TooltipTrigger>
        <TooltipContent>
          {props.enabled ? (copied() ? t("Copied!") : t("Copy app URL")) : props.disabledReason}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
