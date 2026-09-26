# type.ps1 - text entry into a window
#   -Method clip (default): Set-Clipboard(Text) -> POST Ctrl+V to target window -> restore previous clipboard.
#                 Background (no focus steal); classic Win32 apps handle it, modern UI (WinUI/CEF/Chromium) may not.
#   -Method fg  : Set-Clipboard(Text) -> real Ctrl+V via keybd_event on the FOREGROUND window -> restore clipboard.
#                 Needs target foreground (or bringable); never blind-types: ERR_NOFOCUS if focus unavailable.
#   -Mode char  : background WM_CHAR per char, no clipboard use (classic edit controls only)
#   prints: BGTYPE OK <method/mode> before=x,y after=x,y chars=N   (before==after => cursor untouched)
param(
  [string]$WindowTitle="",
  [string]$Text="",
  [string]$Method="clip",     # clip | fg
  [string]$Mode="",           # "" | char
  [int]$DelayMs=900,
  [switch]$KeepClipboard
)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "keys.cs")
if(-not $WindowTitle){ Write-Output "ERR_NO_WINDOW"; exit 2 }
$p=Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
if(-not $p){ Write-Output "ERR_NO_WINDOW"; exit 2 }
$hwnd=$p.MainWindowHandle

if($Mode -eq "char"){
  $r=[WinBgKeys]::SendChars($hwnd,$Text)
  Write-Output ("BGTYPE OK char " + $r + " chars=" + $Text.Length)
  exit 0
}

# remember old clipboard, set target text, inject paste, restore old clipboard
$old=$null
try { $old=Get-Clipboard -Raw -ErrorAction Stop } catch { $old=$null }
try { Set-Clipboard -Value $Text -ErrorAction Stop } catch { Write-Output "ERR_CLIPBOARD"; exit 3 }
Start-Sleep -Milliseconds 200
if($Method -eq "fg"){
  $r=[WinBgKeys]::PasteFg($hwnd)
} else {
  $r=[WinBgKeys]::PasteClipboard($hwnd)
}
Start-Sleep -Milliseconds $DelayMs
if(-not $KeepClipboard){
  try {
    if($null -ne $old){ Set-Clipboard -Value $old -ErrorAction SilentlyContinue }
    else { Set-Clipboard -Value "" -ErrorAction SilentlyContinue }
  } catch { }
}
Write-Output ("BGTYPE OK " + $Method + " " + $r + " chars=" + $Text.Length)

