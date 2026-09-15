import { onMount } from 'solid-js';
import { useTheme } from '@opencode-ai/ui/theme/context';
import { useSettings } from '@opencode-ai/app/settings/model';
import { timelinePresets } from '@opencode-ai/session-ui/timeline/detail';

// Keep tool activity concise, but never bury reasoning inside a second disclosure.
const activityTimeline = {
  ...timelinePresets.find((preset) => preset.id === 'detailed')!.value,
  thinking: { placement: 'separate' as const, details: 'expanded' as const },
};

export default function OpencodeOverrides() {
  const theme = useTheme();
  const settings = useSettings();

  onMount(() => {
    theme.setColorScheme('light');
    settings.appearance.setTabLayout('horizontal');
    settings.general.setShowFileTree(false);
    settings.general.setShowCustomAgents(true);
    settings.general.setTimelineDetail(activityTimeline);
    settings.general.setReleaseNotes(false);
  });

  return null;
}
