$input | python (Join-Path $PSScriptRoot 'hook-runner.py') 'detect-feedback-signal'
exit $LASTEXITCODE
