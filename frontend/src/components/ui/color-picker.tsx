import { ColorArea } from '@kobalte/core/color-area';
import { ColorField } from '@kobalte/core/color-field';
import { ColorSlider } from '@kobalte/core/color-slider';
import { parseColor, type Color } from '@kobalte/core/colors';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { cn } from '~/lib/cn';

const FALLBACK_HEX = '#000000';
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function toHsbColor(hex: string): Color {
  try {
    return parseColor(hex).toFormat('hsb');
  } catch {
    return parseColor(FALLBACK_HEX).toFormat('hsb');
  }
}

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  class?: string;
}

export function ColorPicker(props: ColorPickerProps) {
  const [color, setColor] = createSignal<Color>(toHsbColor(props.value));
  const hex = createMemo(() => color().toString('hex'));
  const [text, setText] = createSignal(props.value);

  createEffect(() => {
    const incoming = props.value;
    if (hex().toLowerCase() !== incoming.toLowerCase()) setColor(toHsbColor(incoming));
  });

  createEffect(() => {
    setText(hex());
  });

  const commit = (next: Color) => {
    setColor(next);
    props.onChange(next.toString('hex'));
  };

  const onFieldChange = (raw: string) => {
    setText(raw);
    const candidate = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_PATTERN.test(candidate)) commit(parseColor(candidate).toFormat('hsb'));
  };

  return (
    <div class={cn('space-y-2', props.class)}>
      <ColorArea
        class="block w-full"
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
        value={color()}
        onChange={commit}
      >
        <ColorArea.Background class="relative h-32 w-full rounded-md border border-border">
          <ColorArea.Thumb
            class="size-4 rounded-full border-2 border-white shadow-sm ring-1 ring-black/25"
            style={{ 'background-color': 'var(--kb-color-current)' }}
          >
            <ColorArea.HiddenInputX />
            <ColorArea.HiddenInputY />
          </ColorArea.Thumb>
        </ColorArea.Background>
      </ColorArea>

      <ColorSlider class="block w-full" channel="hue" colorSpace="hsb" value={color()} onChange={commit}>
        <ColorSlider.Track class="relative h-4 w-full rounded-full border border-border">
          <ColorSlider.Thumb
            class="top-0 size-4 rounded-full border-2 border-white shadow-sm ring-1 ring-black/25"
            style={{ 'background-color': 'var(--kb-color-current)' }}
          >
            <ColorSlider.Input />
          </ColorSlider.Thumb>
        </ColorSlider.Track>
      </ColorSlider>

      <div class="flex items-center gap-2">
        <span
          class="size-8 shrink-0 rounded-md border border-border"
          style={{ 'background-color': hex() }}
          aria-hidden="true"
        />
        <ColorField class="flex-1" value={text()} onChange={onFieldChange}>
          <ColorField.Input class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs uppercase text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </ColorField>
      </div>
    </div>
  );
}
