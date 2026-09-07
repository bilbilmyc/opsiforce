import { onMount } from 'solid-js';
import { useTheme } from '@opencode-ai/ui/theme/context';
import { useSettings } from '@opencode-ai/app/settings/model';
import { timelinePresets } from '@opencode-ai/session-ui/timeline/detail';

const quietTimeline = timelinePresets.find((preset) => preset.id === 'quiet')!.value;

export default function OpencodeOverrides() {
  const theme = useTheme();
  const settings = useSettings();

  onMount(() => {
    theme.setColorScheme('light');
    settings.appearance.setTabLayout('horizontal');
    settings.general.setShowFileTree(false);
    settings.general.setTimelineDetail(quietTimeline);
    settings.general.setReleaseNotes(false);
  });

  return null;
}
