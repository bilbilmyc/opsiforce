import { t } from '~/i18n';
import { Dynamic } from 'solid-js/web';
import { Show } from 'solid-js';
import type { ExternalServiceSummary } from '~/api/external-services';
import { EXTERNAL_SERVICE_UI } from './service-registry';

export function EnvironmentServiceSection(props: { service: ExternalServiceSummary; projectEnvironmentId: string }) {
  const section = () => EXTERNAL_SERVICE_UI[props.service.name]?.EnvironmentSection;

  return (
    <section class="space-y-2">
      <h3 class="text-sm font-semibold text-foreground">{props.service.displayName}</h3>
      <Show when={section()} fallback={<p class="text-xs text-muted-foreground">{t("No configuration UI here yet.")}</p>}>
        {(Component) => <Dynamic component={Component()} projectEnvironmentId={props.projectEnvironmentId} />}
      </Show>
    </section>
  );
}
