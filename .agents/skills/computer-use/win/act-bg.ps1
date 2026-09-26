# act-bg.ps1 - background click (PostMessage): no cursor move / no focus steal
param([string]$WindowTitle="",[int]$X=0,[int]$Y=0)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "input2.cs")
if($WindowTitle){
  $p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
  if(-not $p){ Write-Output "ERR_NO_WINDOW"; exit 2 }
  Write-Output ("BGCLICK " + [WinBgInput]::ClickBg($p.MainWindowHandle,$X,$Y) + " at " + $X + "," + $Y)
} else {
  Write-Output "ERR_NO_WINDOW"; exit 2
}

