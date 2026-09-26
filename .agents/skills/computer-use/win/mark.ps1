# mark.ps1 - draw confirmation marker(s) on a screenshot copy (dry-run preview for a planned click)
#   usage: mark.ps1 -Path <png> -Pts "x:y[,x:y...]" [-Out <png>] [-Size 20]
#   - coordinates are in the SAME pixel space as the source png (== act-bg click space)
#   - source file untouched; -Out defaults to <base>-marked.png next to the source
#   prints JSON: {"in":..,"out":..,"pts":..,"ok":true}
param(
  [string]$Path = "skills/computer-use/shots/cur.png",
  [string]$Pts = "",
  [string]$Out = "",
  [int]$Size = 20
)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
if(-not $Pts){ Write-Output "ERR_NO_PTS"; exit 2 }
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "mark.cs") -ReferencedAssemblies @("System.Drawing")
$src=(Resolve-Path $Path).Path
$dir=[System.IO.Path]::GetDirectoryName($src)
$base=[System.IO.Path]::GetFileNameWithoutExtension($src)
$dst=if($Out){ if([System.IO.Path]::IsPathRooted($Out) -or $Out.Contains(":")){ $Out } else { Join-Path $dir $Out } } else { Join-Path $dir ($base+"-marked.png") }
$r=[WinMark]::Mark($src,$dst,$Pts,$Size,"")
if($r.StartsWith("ERR")){ Write-Output $r; exit 1 }
Write-Output $r
