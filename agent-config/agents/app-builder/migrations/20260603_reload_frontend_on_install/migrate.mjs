#!/usr/bin/env node
import { constants } from "node:fs"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const workspace = process.env.WORKSPACE || "/workspace"
const appDir = path.join(workspace, "app")
const yarnrcPath = path.join(appDir, ".yarnrc.yml")
const pluginRel = ".yarn/plugins/reload-frontend-vite.cjs"
const pluginPath = path.join(appDir, pluginRel)

const plugin = `// Bounce the Vite dev server after every install. A new or removed dependency rewrites
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
`

// framer-motion (via the `motion` package) does an optional require('@emotion/is-prop-valid')
// that it only lists as an optional peer dependency, so nothing installs it. Under strict PnP
// that undeclared require is a hard error that fails Vite's dependency optimizer. Declaring it
// as a dependency of framer-motion makes Yarn install and resolve it. Takes effect on the
// workspace's next install (the reload plugin above bounces Vite once that install completes).
const framerMotionEntry = `  "framer-motion@*":
    dependencies:
      "@emotion/is-prop-valid": "*"
`

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

if (!(await exists(yarnrcPath))) {
  process.stdout.write("no .yarnrc.yml found; skipping migration\n")
} else {
  await mkdir(path.dirname(pluginPath), { recursive: true })
  await writeFile(pluginPath, plugin)

  let current = await readFile(yarnrcPath, "utf8")
  if (current.includes(pluginRel)) {
    process.stdout.write("frontend-reload plugin already registered in .yarnrc.yml\n")
  } else {
    current = `${current.replace(/\s*$/, "")}\n\nplugins:\n  - path: ${pluginRel}\n`
    await writeFile(yarnrcPath, current)
    process.stdout.write("installed frontend-reload plugin and registered it in .yarnrc.yml\n")
  }

  current = await readFile(yarnrcPath, "utf8")
  if (current.includes("@emotion/is-prop-valid")) {
    process.stdout.write("framer-motion packageExtension already present\n")
  } else if (/^packageExtensions:[^\n]*\n/m.test(current)) {
    current = current.replace(/^packageExtensions:[^\n]*\n/m, (line) => `${line}${framerMotionEntry}`)
    await writeFile(yarnrcPath, current)
    process.stdout.write("added framer-motion packageExtension under existing packageExtensions\n")
  } else {
    current = `${current.replace(/\s*$/, "")}\n\npackageExtensions:\n${framerMotionEntry}`
    await writeFile(yarnrcPath, current)
    process.stdout.write("added framer-motion packageExtension to .yarnrc.yml\n")
  }
}
