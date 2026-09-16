// Bounce the Vite dev server after every install. A new or removed dependency rewrites
// the Yarn PnP manifest (.pnp.cjs), but the long-running Vite process only reads it at
// startup and would crash trying to resolve the new package. Killing Vite makes its
// guard restart it with the fresh manifest. The backend (nest --watch) re-execs itself
// on change, so it picks up the new manifest on its own and is left alone.
module.exports = {
  name: 'plugin-reload-frontend-vite',
  factory: (require) => ({
    hooks: {
      afterAllInstalled() {
        try {
          require('child_process').execFileSync('pkill', ['-f', 'vite/bin/vite.js frontend'])
        } catch (e) {
          // pkill exits non-zero when Vite isn't running yet (e.g. the first install) — fine.
        }
      },
    },
  }),
}
