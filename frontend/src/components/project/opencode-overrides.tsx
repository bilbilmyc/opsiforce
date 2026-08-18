import { createRenderEffect, onMount, untrack } from 'solid-js';
import { useTheme } from '@opencode-ai/ui/theme/context';
import { useLayout } from '@opencode-ai/app/context/layout';
import { useSettings } from '@opencode-ai/app/context/settings';

export default function OpencodeOverrides() {
  const theme = useTheme();
  const layout = useLayout();
  const settings = useSettings();

  createRenderEffect(() => {
    untrack(() => {
      layout.fileTree.close();
      layout.view('').reviewPanel.close();
    });
  });

  onMount(() => {
    theme.setColorScheme('light');
    layout.sidebar.close();

    settings.general.setShellToolPartsExpanded(false);
    settings.general.setEditToolPartsExpanded(false);
    // Suppress upstream's onboarding noise in the embedded chat: the release-notes
    // dialog (highlights.tsx gates on releaseNotes) and the "Introducing Tabs"
    // corner toast (help-button.tsx gates on shouldDisplayTabsToast).
    settings.general.setReleaseNotes(false);
    settings.general.dismissTabsToast();
  });

  return null;
}
