# ============================================================
# EDIT THE 5 LINES BELOW (between the quotes), save, then load
# them into your terminal with:
#
#     . .\set-env.ps1
#
# (a dot, a space, then the path)
# ============================================================

$env:TURSO_DATABASE_URL   = "libsql://allotment-blog-michalpresz131-spec.aws-eu-west-1.turso.io"
$env:TURSO_AUTH_TOKEN     = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk5OTI5ODYsImlkIjoiMDFhMGMzZTQtMjIwMS03NDk2LTkxZWQtOTk0ODZlZGFmMjYyIiwia2lkIjoiYzhod2poMmxabzVJNHlSODQ2QjFvLTAzcUxLRTNtY1hQakkwTHpoSDZRQSIsInJpZCI6Ijk2OGNjOGY2LTE3NTItNDhkYS1hZTFlLTkwMzBiYTY3MGViMSJ9.xrkp5ZTamgLRpL9LG5DLJ1PTXhJJCpW2d1yLUQMD57bER4lYRGpx3jte9lqNOtPd4drfryg6-FXW45uYareiDw"
$env:GMAIL_USER           = "michalpresz131@gmail.com"
$env:GMAIL_APP_PASSWORD   = "gjhy zwun przx nksz"
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
