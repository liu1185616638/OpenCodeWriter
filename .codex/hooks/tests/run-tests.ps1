$ErrorActionPreference = 'Stop'

$hooks = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python).Source
$temp = Join-Path ([IO.Path]::GetTempPath()) ("codex-hooks-" + [guid]::NewGuid().ToString('N'))
$failures = [System.Collections.Generic.List[string]]::new()

function Invoke-Hook([string]$name, [hashtable]$payload) {
    $json = $payload | ConvertTo-Json -Depth 10 -Compress
    return $json | & (Join-Path $hooks "$name.ps1") 2>&1 | Out-String
}

function Assert-Match([string]$name, [string]$actual, [string]$pattern) {
    if ($actual -notmatch $pattern) {
        $failures.Add("$name failed: expected /$pattern/, got: $actual")
    } else {
        Write-Output "PASS: $name"
    }
}

try {
    New-Item -ItemType Directory -Path $temp | Out-Null
    git -C $temp init -q
    git -C $temp config user.email 'hooks@example.test'
    git -C $temp config user.name 'Hook Tests'
    Set-Content -LiteralPath (Join-Path $temp 'seed.txt') -Value 'seed'
    git -C $temp add seed.txt
    git -C $temp commit -qm 'seed'
    git -C $temp switch -c dev -q

    Set-Content -LiteralPath (Join-Path $temp 'package.json') -Value '{"scripts":{"build":"node -e \"process.exit(1)\""}}'
    $out = Invoke-Hook 'pre-tool-shell' @{ hook_event_name = 'PreToolUse'; tool_name = 'Bash'; cwd = $temp; tool_input = @{ command = 'git commit -m test' } }
    Assert-Match 'pre-tool-shell blocks failed build' $out 'permissionDecision.*deny'

    $oldPath = $env:PATH
    try {
        $env:PATH = $temp
        $payload = @{ hook_event_name = 'PreToolUse'; tool_name = 'Bash'; cwd = $temp; tool_input = @{ command = 'git commit -m test' } } | ConvertTo-Json -Depth 10 -Compress
        $out = $payload | & $python (Join-Path $hooks 'hook-runner.py') 'pre-tool-shell' 2>&1 | Out-String
    } finally {
        $env:PATH = $oldPath
    }
    Assert-Match 'pre-tool-shell blocks missing build tool' $out 'permissionDecision.*deny'

    git -C $temp remote add origin 'https://example.invalid/repo.git'
    $env:CODEX_HOOK_DRY_RUN = '1'
    $out = Invoke-Hook 'auto-push' @{ hook_event_name = 'PostToolUse'; tool_name = 'Bash'; cwd = $temp; tool_input = @{ command = 'git commit -m test' }; tool_response = @{ exit_code = 0 } }
    Assert-Match 'auto-push supports dry run' $out 'dry.run'
    git -C $temp switch master -q
    $out = Invoke-Hook 'auto-push' @{ hook_event_name = 'PostToolUse'; tool_name = 'Bash'; cwd = $temp; tool_input = @{ command = 'git commit -m test' }; tool_response = @{ exit_code = 0 } }
    Assert-Match 'auto-push skips protected branch' $out '跳过保护分支'
    git -C $temp switch dev -q
    Remove-Item Env:CODEX_HOOK_DRY_RUN

    $state = Join-Path $temp '.codex/.state'
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $state 'review-needed') -Value 'pending'
    $out = Invoke-Hook 'pre-tool-shell' @{ hook_event_name = 'PreToolUse'; tool_name = 'Bash'; cwd = $temp; tool_input = @{ command = 'git commit -m test' } }
    Assert-Match 'pre-tool-shell blocks pending review' $out 'permissionDecision.*deny'
    $out = Invoke-Hook 'stop-gate' @{ hook_event_name = 'Stop'; cwd = $temp; stop_hook_active = $false }
    Assert-Match 'stop-gate continues pending review' $out 'decision.*block'
    $out = Invoke-Hook 'stop-gate' @{ hook_event_name = 'Stop'; cwd = $temp; stop_hook_active = $true }
    Assert-Match 'stop-gate avoids continuation loop' $out 'continue.*false'

    Remove-Item -LiteralPath (Join-Path $state 'review-needed')
    New-Item -ItemType Directory -Path (Join-Path $temp 'src') | Out-Null
    Set-Content -LiteralPath (Join-Path $temp 'src/app.ts') -Value 'export const value = 1;'
    $out = Invoke-Hook 'mark-review-needed' @{ hook_event_name = 'PostToolUse'; tool_name = 'apply_patch'; cwd = $temp; tool_input = @{ command = 'edit src/app.ts' } }
    if (-not (Test-Path (Join-Path $state 'review-needed'))) {
        $failures.Add('mark-review-needed failed: state file missing')
    } else {
        Write-Output 'PASS: mark-review-needed records code changes'
    }

    $out = Invoke-Hook 'detect-feedback-signal' @{ hook_event_name = 'UserPromptSubmit'; session_id = 'test-session'; cwd = $temp; prompt = '你又忽略了错误状态，这样不对' }
    $signals = Join-Path $temp '.codex/evolution/signals.jsonl'
    if (-not (Test-Path $signals) -or (Get-Content -Raw $signals) -notmatch '错误状态') {
        $failures.Add('detect-feedback-signal failed: signal not appended')
    } else {
        Write-Output 'PASS: detect-feedback-signal appends correction'
    }

    $out = Invoke-Hook 'check-evolution' @{ hook_event_name = 'SessionStart'; source = 'startup'; cwd = $temp }
    Assert-Match 'check-evolution reports backlog' $out 'additionalContext'

    if ($failures.Count -gt 0) {
        $failures | ForEach-Object { Write-Error $_ }
        exit 1
    }
} finally {
    if (Test-Path $temp) {
        Remove-Item -Recurse -Force -LiteralPath $temp
    }
}

Write-Output 'PASS: 10 hook behaviors verified'
