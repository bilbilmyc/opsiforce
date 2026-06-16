import { SettingsSection } from '~/components/settings/settings-section';
import { Layers } from '~/components/icons';
import { TenantEnvironmentsSection } from '~/components/tenant-environments/tenant-environments-section';

export function EnvironmentsPage() {
  return (
    <SettingsSection
      icon={Layers}
      title="Environments"
      description="The publish targets every project can deploy to — Development, Production, and any you add."
    >
      <TenantEnvironmentsSection active={true} />
    </SettingsSection>
  );
}
