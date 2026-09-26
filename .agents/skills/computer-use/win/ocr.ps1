# ocr.ps1 - Windows.Media.Ocr on an image file; prints "TEXT <x> <y> <w> <h> <text>"
# usage: powershell -File ocr.ps1 -Path <image>
param([string]$Path="skills/computer-use/state/game.png")
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
$asTaskGeneric=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await($t,$rt){ $m=$asTaskGeneric.MakeGenericMethod($rt); $nt=$m.Invoke($null,@($t)); $nt.Wait(-1)|Out-Null; $nt.Result }
$full=(Resolve-Path $Path).Path
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$dec=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp=Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if(-not $engine){ Write-Output "NO_OCR_ENGINE"; exit 2 }
$res=Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
foreach($line in $res.Lines){
  $minX=1e9; $maxR=-1; $topY=0; $hh=0
  foreach($wd in $line.Words){
    $rc=$wd.BoundingRect
    if($rc.X -lt $minX){ $minX=$rc.X; $topY=$rc.Y; $hh=$rc.Height }
    $rr=$rc.X+$rc.Width
    if($rr -gt $maxR){ $maxR=$rr }
  }
  if($minX -eq 1e9){continue}
  Write-Output ("TEXT {0} {1} {2} {3} {4}" -f [int]$minX,[int]$topY,[int]($maxR-$minX),[int]$hh,$line.Text)
}
Write-Output ("IMG {0}x{1}" -f $bmp.PixelWidth,$bmp.PixelHeight)

