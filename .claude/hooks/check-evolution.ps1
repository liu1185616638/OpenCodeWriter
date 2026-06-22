$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'check-evolution'
exit $LASTEXITCODE
