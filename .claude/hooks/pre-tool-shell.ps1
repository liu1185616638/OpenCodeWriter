$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'pre-tool-shell'
exit $LASTEXITCODE
