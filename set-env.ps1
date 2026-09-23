# ============================================================
# EDIT THE 5 LINES BELOW (between the quotes), save, then load
# them into your terminal with:
#
#     . .\set-env.ps1
#
# (a dot, a space, then the path)
# ============================================================

$env:TURSO_DATABASE_URL   = "libsql://allotment-blog-michalpresz131-spec.aws-eu-west-1.turso.io"
$env:TURSO_AUTH_TOKEN     = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTAxNTc2MTIsImlkIjoiMDFhMGM0NWQtYjYwMS03ZTZlLWI1YTEtZmQ3YjU1NDVkMGRmIiwia2lkIjoiYzhod2poMmxabzVJNHlSODQ2QjFvLTAzcUxLRTNtY1hQakkwTHpoSDZRQSIsInJpZCI6IjVkOGViMjRmLWZiMzQtNGRkMy05ZmI5LTA4ZWU2ZjE5YWQ0MiJ9.7YCJn74dvanNzvyfM2hLJ862OcxNUp0DKr6lc6ZTDhDeZYTLSMETpLIuehyiyF5LhV9S8MjF3FD59i2yOPYQCQ"
$env:GMAIL_USER           = "michalpresz131@gmail.com"
$env:GMAIL_APP_PASSWORD   = "snei mpim ntym niac"
$env:NOTIFY_EMAIL         = "michalpresz131@gmail.com"
$env:PORT                 = "3000"

# ============================================================
# Nothing below this line needs editing.
# ============================================================

function Show-EnvValue($name, $value, $previewChars){
    if([string]::IsNullOrEmpty($value)){
        Write-Host "  $name = *** NOT SET / BLANK ***" -ForegroundColor Red
        return
    }
    if($value.Length -le $previewChars){
        Write-Host "  $name = $value (length $($value.Length))"
    } else {
        Write-Host "  $name = $($value.Substring(0,$previewChars))... (length $($value.Length))"
    }
}

Write-Host ""
Write-Host "Environment variables loaded:"
Write-Host "  TURSO_DATABASE_URL = $env:TURSO_DATABASE_URL"
Show-EnvValue "TURSO_AUTH_TOKEN  " $env:TURSO_AUTH_TOKEN 12
Write-Host "  GMAIL_USER          = $env:GMAIL_USER"
Show-EnvValue "GMAIL_APP_PASSWORD" $env:GMAIL_APP_PASSWORD 4
Write-Host "  NOTIFY_EMAIL        = $env:NOTIFY_EMAIL"
Write-Host "  PORT                = $env:PORT"
Write-Host ""
