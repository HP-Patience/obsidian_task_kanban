# info.ps1 - list windows + screen geometry (JSON on stdout, UTF-8)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Info {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
}
"@ -ErrorAction SilentlyContinue
$SM_XVIRTUALSCREEN=76; $SM_YVIRTUALSCREEN=77; $SM_CXVIRTUALSCREEN=78; $SM_CYVIRTUALSCREEN=79
$vx=[Win32Info]::GetSystemMetrics($SM_XVIRTUALSCREEN)
$vy=[Win32Info]::GetSystemMetrics($SM_YVIRTUALSCREEN)
$vw=[Win32Info]::GetSystemMetrics($SM_CXVIRTUALSCREEN)
$vh=[Win32Info]::GetSystemMetrics($SM_CYVIRTUALSCREEN)
$dpi=0
try { $dpi=[Win32Info]::GetDpiForSystem() } catch { $dpi=96 }
$wins = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowHandle -ne 0 } | ForEach-Object {
  [PSCustomObject]@{ pid=$_.Id; name=$_.ProcessName; title=$_.MainWindowTitle }
}
$obj = [PSCustomObject]@{
  virtual_screen = @{ x=$vx; y=$vy; width=$vw; height=$vh }
  system_dpi = $dpi
  scale = [Math]::Round($dpi/96.0,2)
  windows = @($wins)
}
$obj | ConvertTo-Json -Depth 4 -Compress

