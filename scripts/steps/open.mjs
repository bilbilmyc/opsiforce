const APP_URL = 'https://opsiforce.localtest.me';

export async function run(ctx) {
  ctx.note('opening Opsiforce — you land already signed in as the local dev user, with full admin access.');
  ctx.print(ctx.c.bold(APP_URL));

  if (!process.stdin.isTTY) return;
  try {
    ctx.run('open', [APP_URL]);
  } catch (error) {
    ctx.warn(`Could not open a browser automatically (${error.message}). Open ${APP_URL} yourself.`);
  }
}
