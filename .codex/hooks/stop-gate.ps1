$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'stop-gate'
exit $LASTEXITCODE
