import { spawnSync } from "node:child_process"

const requiredVersion = "go1.26.2"

const missingMessage = [
  `Go ${requiredVersion.slice(2)} is required for Opsiforce runtime proxies.`,
  "Install that exact version and re-run the command.",
  "The runtime-proxy Docker image uses the same Go version.",
].join("\n")

const missing = spawnSync("go", ["env", "GOVERSION"], {
  encoding: "utf8",
})

if (missing.error) {
  process.stderr.write(`${missingMessage}\n`)
  process.exit(1)
}

const installedVersion = missing.stdout.trim()

if (missing.status !== 0 || installedVersion !== requiredVersion) {
  process.stderr.write(
    `${missingMessage}\nDetected: ${installedVersion || "unknown"}\n`,
  )
  process.exit(1)
}
