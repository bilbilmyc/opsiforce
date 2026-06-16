import { SettingsSection } from '~/components/settings/settings-section';
import { Users } from '~/components/icons';
import RemoteComponentRuntime from '~/components/remote-component-runtime';

export function UsersPage() {
  return (
    <SettingsSection icon={Users} title="Users" description="Manage members and their access." width="wide">
      <RemoteComponentRuntime url="/ms-assets/remoteEntry.js" scope="ui" module="App" type="esm" />
    </SettingsSection>
  );
}
