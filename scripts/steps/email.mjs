export async function run(ctx) {
  const prior = ctx.config.emailTesting === true;

  if (ctx.flags.yes || !process.stdin.isTTY) {
    ctx.config.emailTesting = prior;
    ctx.note(
      prior
        ? 'local email testing stays on (from a previous run).'
        : 'local email testing off (the default) — no mail mock runs.'
    );
    return;
  }

  ctx.print('Off by default — enable this only if you are testing email flows.');
  ctx.print('When on, a mail mock captures every outbound send at');
  ctx.print('http://localhost:8089 instead of delivering it.');
  ctx.print('');

  const enable = await ctx.confirm('Enable local email testing?', { defaultYes: prior });
  ctx.config.emailTesting = enable;
  ctx.note(
    enable
      ? 'local email testing on — the mail mock starts with the stack (Tilt: mail-mock).'
      : 'local email testing off — start the mail-mock resource from the Tilt UI when you need it.'
  );
}
