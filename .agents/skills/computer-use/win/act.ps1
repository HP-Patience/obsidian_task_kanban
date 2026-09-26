# act.ps1 - click a point inside a window by title substring
param([string]$WindowTitle="",[int]$X=0,[int]$Y=0)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "input.cs")
if($WindowTitle){
  $p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
  if(-not $p){ Write-Output "ERR_NO_WINDOW"; exit 2 }
  $r=[WinInput]::Click($p.MainWindowHandle,$X,$Y)
  Write-Output ("CLICK "+$r+" at "+$X+","+$Y+" win="+$p.MainWindowTitle)
} else {
  $hwnd=[WinInput]::GetForegroundWindow()
  $r=[WinInput]::Click($hwnd,$X,$Y)
  Write-Output ("CLICK "+$r+" fg-window "+$hwnd)
}

