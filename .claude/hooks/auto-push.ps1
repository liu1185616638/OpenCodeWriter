$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'auto-push'
exit $LASTEXITCODE
