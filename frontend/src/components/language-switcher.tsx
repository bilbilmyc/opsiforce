import { locale, setLocale } from '~/i18n';

export function LanguageSwitcher() {
  return (
    <div class="px-2 py-1">
      <label class="flex items-center justify-between gap-2 text-xs text-sidebar-muted-foreground group-data-[collapsible=icon]/sidebar:hidden">
        <span>语言 / Language</span>
        <select aria-label="语言 / Language" value={locale()} onChange={event => setLocale(event.currentTarget.value === 'en' ? 'en' : 'zh-CN')}
          class="h-8 min-w-0 rounded-md border border-sidebar-border bg-sidebar px-2 text-xs text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="zh-CN" selected={locale() === 'zh-CN'}>简体中文</option>
          <option value="en" selected={locale() === 'en'}>English</option>
        </select>
      </label>
      <button type="button" class="hidden size-7 items-center justify-center rounded-md text-xs hover:bg-sidebar-accent group-data-[collapsible=icon]/sidebar:flex"
        title="语言 / Language" aria-label="语言 / Language" onClick={() => setLocale(locale() === 'en' ? 'zh-CN' : 'en')}>
        {locale() === 'en' ? 'EN' : '中'}
      </button>
    </div>
  );
}
