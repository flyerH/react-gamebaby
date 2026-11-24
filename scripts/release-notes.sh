#!/usr/bin/env bash
# 生成 GitHub Release 描述：上一个 tag 以来的提交按类型分组，末尾附 APK 的 SHA256
# 用法：scripts/release-notes.sh <tag> <apk 路径>
set -euo pipefail

tag=$1
apk=$2

section() {
  local lines
  lines=$(git log --format=%s "$prev..$tag" | sed -nE "s/^$2: (.+)$/- \1/p")
  if [[ -n $lines ]]; then
    printf '## %s\n\n%s\n\n' "$1" "$lines"
  fi
}

# 首个 tag 之前的提交是从零开发的全部历史，不列出；不符合 type: 描述 格式的提交不列出
prev=$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)
if [[ -z $prev ]]; then
  printf '首个版本。\n\n'
else
  section 新功能 feat
  section 问题修复 fix
  section 性能优化 perf
  section 重构 refactor
fi

if command -v sha256sum >/dev/null; then
  hash=$(sha256sum "$apk")
else
  hash=$(shasum -a 256 "$apk")
fi
printf '## SHA256\n\n```\n%s  %s\n```\n' "${hash%% *}" "$(basename "$apk")"
