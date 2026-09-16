#!/usr/bin/env bash
# Run on EACH Linux node that hosts Agent pods, not on a remote kubectl client.
# Default is read-only. Raising this per-UID budget does not allocate it up front.
set -euo pipefail

mode=${1:---check}
case "$mode" in --check|--apply) ;; *) echo 'Usage: bash prepare-agent-node.sh [--check|--apply]' >&2; exit 2;; esac
[[ $(uname -s) == Linux ]] || { echo '请在承载 Agent Pod 的 Linux 节点上执行。' >&2; exit 2; }
command -v python3 >/dev/null || { echo '检查需要 python3。' >&2; exit 2; }

minimum=1024
current=$(sysctl -n fs.inotify.max_user_instances)
[[ $current =~ ^[0-9]+$ ]] || { echo '无法读取 inotify 实例上限。' >&2; exit 1; }

if [[ "$mode" == --apply ]]; then
  [[ $EUID -eq 0 ]] || { echo '--apply 需要 root。' >&2; exit 2; }
  value=$current
  if (( value < minimum )); then value=$minimum; fi
  config=/etc/sysctl.d/99-opsiforce-inotify.conf
  if [[ -f "$config" ]]; then cp -p "$config" "$config.bak.$(date +%Y%m%d%H%M%S)"; fi
  temp=$(mktemp)
  trap 'rm -f "$temp"' EXIT
  printf '# Opsiforce Agents share the host per-UID inotify instance budget.\nfs.inotify.max_user_instances = %s\n' "$value" > "$temp"
  install -m 0644 "$temp" "$config"
  sysctl -p "$config"
  current=$value
fi

printf '节点 %s：fs.inotify.max_user_instances=%s，建议最低 %s\n' "$(hostname)" "$current" "$minimum"
# Distinguish instance exhaustion (EMFILE) from watch exhaustion (ENOSPC).
# A successful allocation is only a point-in-time check, not a capacity guarantee.
python3 - <<'PY'
import ctypes, os, sys
libc = ctypes.CDLL(None, use_errno=True)
fd = libc.inotify_init1(os.O_CLOEXEC | os.O_NONBLOCK)
if fd < 0:
    code = ctypes.get_errno()
    print(f'FAIL: 无法创建 inotify 实例，errno={code} ({os.strerror(code)})', file=sys.stderr)
    sys.exit(1)
os.close(fd)
print('PASS: inotify 实例可分配')
PY
if (( current < minimum )); then
  echo '当前额度偏低；在该节点执行 --apply 可提升并持久化，已有更高值会保留。' >&2
  exit 1
fi
