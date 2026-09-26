# snap.ps1 - capture screen/window via WinCapture.cs (C#), print META json
param(
  [string]$Out = "skills/computer-use/state/screen.png",
  [string]$WindowTitle = "",
  [int]$Quality = 80,
  [switch]$B64
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cs = Join-Path $here "capture.cs"
Add-Type -Path $cs -ReferencedAssemblies @("System.Drawing")
$fmt = 1  # png default
if ($Out -like "*.jpg" -or $Out -like "*.jpeg") { $fmt = 0 }
$abs = Join-Path (Get-Location) $Out
$hwnd = [IntPtr]::Zero
$title = $null
if ($WindowTitle) {
  $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
  if (-not $p) { Write-Output "ERR_NO_WINDOW"; exit 2 }
  $hwnd = $p.MainWindowHandle
  $title = $p.MainWindowTitle
  $res = [WinCapture]::CaptureWindow($hwnd, $abs, $Quality, $fmt)
} else {
  $res = [WinCapture]::CaptureFull($abs, $Quality, $fmt)
}
if ($res -ne "OK") { Write-Output ("CAP_ERR " + $res); exit 3 }
$f = Get-Item $abs
$r = New-Object WinCapture+RECT
$rect = $null
if ($hwnd -ne [IntPtr]::Zero) {
  if ([WinCapture]::GetWindowRect($hwnd, [ref]$r)) {
    $rect = @{ x=$r.Left; y=$r.Top; width=$r.Right-$r.Left; height=$r.Bottom-$r.Top }
  }
}
$meta = [PSCustomObject]@{ file = $Out; bytes = $f.Length; window = $title; rect = $rect }
Write-Output ("META " + ($meta | ConvertTo-Json -Compress))
if ($B64) {
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  Write-Output ("LEN=" + $bytes.Length)
  Write-Output ([Convert]::ToBase64String($bytes))
  Write-Output "END"
}

