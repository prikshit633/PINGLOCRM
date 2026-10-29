Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot '..\assets\pinglo-logo.png'
$dst = Join-Path $PSScriptRoot '..\assets\pinglo-logo-transparent.png'
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $src))
$w = $img.Width; $h = $img.Height
$out = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$inData = $img.LockBits($rect, 'ReadOnly', [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$outData = $out.LockBits($rect, 'WriteOnly', [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$n = [Math]::Abs($inData.Stride) * $h
$px = New-Object byte[] $n
[System.Runtime.InteropServices.Marshal]::Copy($inData.Scan0, $px, 0, $n)
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
$stride = $inData.Stride
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $stride + $x * 4
    $lum = ($px[$i] + $px[$i+1] + $px[$i+2]) / 3
    $a = [int](255 - $lum)
    if ($a -lt 12) { $a = 0 } elseif ($a -gt 235) { $a = 255 }
    $px[$i] = 0; $px[$i+1] = 0; $px[$i+2] = 0; $px[$i+3] = [byte]$a
    if ($a -gt 0) { if ($x -lt $minX) {$minX=$x}; if ($x -gt $maxX) {$maxX=$x}; if ($y -lt $minY) {$minY=$y}; if ($y -gt $maxY) {$maxY=$y} }
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($px, 0, $outData.Scan0, $n)
$img.UnlockBits($inData); $out.UnlockBits($outData); $img.Dispose()
# Crop to ink with small padding, then scale to 160px tall
$pad = 8
$cx = [Math]::Max(0, $minX - $pad); $cy = [Math]::Max(0, $minY - $pad)
$cw = [Math]::Min($w - $cx, $maxX - $minX + 2*$pad); $ch = [Math]::Min($h - $cy, $maxY - $minY + 2*$pad)
$th = 160; $tw = [int]($cw * $th / $ch)
$final = New-Object System.Drawing.Bitmap $tw, $th, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($final)
$g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($out, (New-Object System.Drawing.Rectangle 0,0,$tw,$th), (New-Object System.Drawing.Rectangle $cx,$cy,$cw,$ch), 'Pixel')
$g.Dispose(); $out.Dispose()
$final.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $final.Dispose()
"Saved $dst  ${tw}x${th}  $((Get-Item $dst).Length) bytes"
