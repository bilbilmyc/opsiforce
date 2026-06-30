#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSIONS_FILE = join(PACKAGE_ROOT, 'versions.json');

function tryCapture(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function parseSemver(text) {
  const match = (text ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match[0] : null;
}

const HOST_CLI_PROBES = {
  homebrew: ['brew', ['--version']],
  minikube: ['minikube', ['version', '--short']],
  kubectl: ['kubectl', ['version', '--client']],
  helm: ['helm', ['version', '--short']],
  tilt: ['tilt', ['version']],
  mkcert: ['mkcert', ['-version']],
};

function captureKubernetes() {
  const output = tryCapture('minikube', ['config', 'defaults', 'kubernetes-version']);
  if (!output) return null;
  const first = output.split('\n')[0].replace(/[*\s]/g, '');
  return first || null;
}

function usage() {
  console.log("Snapshot this machine's known-good versions into versions.json.");
  console.log('');
  console.log('Usage: node scripts/capture-baseline.mjs [--check]');
  console.log('');
  console.log('Refreshes the cluster Kubernetes version and every hostCli "tested" value from');
  console.log('the tools currently installed. Exact install targets (Node, Yarn, chart pins)');
  console.log('and the hostCli floors are hand-managed and left untouched; Node/Yarn are');
  console.log('reported against their pins but not rewritten.');
  console.log('');
  console.log('  --check   Report what would change without writing the file.');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }
  const checkOnly = args.includes('--check');

  if (!existsSync(VERSIONS_FILE)) {
    console.error(`No versions manifest at ${VERSIONS_FILE}.`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(VERSIONS_FILE, 'utf8'));
  const changes = [];

  for (const [key, [command, commandArgs]] of Object.entries(HOST_CLI_PROBES)) {
    const observed = parseSemver(tryCapture(command, commandArgs));
    if (!observed) {
      console.warn(`! ${key}: not detected — leaving tested=${manifest.hostCli[key]?.tested ?? 'unset'}.`);
      continue;
    }
    if (!manifest.hostCli[key]) manifest.hostCli[key] = { tested: null, floor: null, formula: command };
    if (manifest.hostCli[key].tested !== observed) {
      changes.push(`hostCli.${key}.tested  ${manifest.hostCli[key].tested ?? '∅'} → ${observed}`);
      manifest.hostCli[key].tested = observed;
    }
  }

  const kubernetes = captureKubernetes();
  if (kubernetes && manifest.exact.kubernetes !== kubernetes) {
    changes.push(`exact.kubernetes  ${manifest.exact.kubernetes} → ${kubernetes}`);
    manifest.exact.kubernetes = kubernetes;
  }

  reportPin('Node', process.versions.node, manifest.exact.node);
  reportPin('Yarn', parseSemver(tryCapture('yarn', ['--version'])), manifest.exact.yarn);

  if (changes.length === 0) {
    console.log('versions.json already matches this machine — no changes.');
    return;
  }

  console.log(`${checkOnly ? 'Would update' : 'Updated'} versions.json:`);
  for (const change of changes) console.log(`  ${change}`);

  if (!checkOnly) {
    writeFileSync(VERSIONS_FILE, JSON.stringify(manifest, null, 2) + '\n');
  }
}

function reportPin(label, observed, pinned) {
  if (!observed) {
    console.log(`  ${label}: not detected (pinned ${pinned}).`);
    return;
  }
  if (observed !== pinned) {
    console.log(
      `  ${label}: machine ${observed}, pinned ${pinned} (install target — edit the pin + .tool-versions/packageManager together to change it).`
    );
  }
}

main();
