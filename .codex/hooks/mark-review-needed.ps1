$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'mark-review-needed'
exit $LASTEXITCODE
