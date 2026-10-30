#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$project_root"
account_test_dir="$(mktemp -d /tmp/research-account-test.XXXXXX)"
trap 'rm -rf -- "$account_test_dir"' EXIT
account_test_output="$(printf '%s\n' 'research-passphrase-2026' | DATABASE_PATH="$account_test_dir/account.sqlite" node --import tsx scripts/create-account.ts researcher)"
[[ "$account_test_output" == *'researcher'* ]]
[[ "$account_test_output" != *'research-passphrase-2026'* ]]
if printf '%s\n' 'research-passphrase-2026' | DATABASE_PATH="$account_test_dir/account.sqlite" node --import tsx scripts/create-account.ts researcher >"$account_test_dir/repeated.out" 2>"$account_test_dir/repeated.err"; then
  printf 'FAIL: duplicate account was accepted\n' >&2
  exit 1
fi
rg -q '用户名已存在' "$account_test_dir/repeated.err"
printf 'PASS: operator CLI accepts stdin, avoids printing the password, and rejects duplicate accounts.\n'
