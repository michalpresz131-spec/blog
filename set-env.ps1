# ============================================================
# Edit the values below (between the quotes), save this file,
# then load them into your terminal with:
#
#     . .\set-env.ps1
#
# (that's a dot, a space, then the path — it "dot-sources" the
# file so the variables stick around in your current window)
#
# Do this once per new PowerShell window, before running:
#     node server.js
#   or
#     node push-json-to-turso.js
# ============================================================

$env:TURSO_DATABASE_URL   = "PASTE_YOUR_REAL_TURSO_URL_HERE"
$env:TURSO_AUTH_TOKEN     = "PASTE_YOUR_REAL_TURSO_TOKEN_HERE"
$env:GMAIL_USER           = "michalpresz131@gmail.com"
$env:GMAIL_APP_PASSWORD   = "PASTE_YOUR_16_CHAR_APP_PASSWORD_HERE"
$env:NOTIFY_EMAIL         = "michalpresz@gmail.com"
$env:PORT                 = "3000"

# --- sanity check: prints what actually got set, so typos are ---
# --- obvious immediately instead of buried in a later error   ---
Write-Host ""
Write-Host "Environment variables loaded:"
Write-Host "  TURSO_DATABASE_URL = $env:TURSO_DATABASE_URL"
Write-Host "  TURSO_AUTH_TOKEN   = $($env:TURSO_AUTH_TOKEN.Substring(0, [Math]::Min(12,$env:TURSO_AUTH_TOKEN.Length)))... (length $($env:TURSO_AUTH_TOKEN.Length))"
Write-Host "  GMAIL_USER         = $env:GMAIL_USER"
Write-Host "  GMAIL_APP_PASSWORD = $($env:GMAIL_APP_PASSWORD.Substring(0, [Math]::Min(4,$env:GMAIL_APP_PASSWORD.Length)))... (length $($env:GMAIL_APP_PASSWORD.Length))"
Write-Host "  NOTIFY_EMAIL       = $env:NOTIFY_EMAIL"
Write-Host "  PORT               = $env:PORT"
Write-Host ""
