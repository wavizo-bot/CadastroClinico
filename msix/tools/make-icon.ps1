# Gera o icone multiplas dimensoes do executavel a partir de clinic-logo.jpg
# Uso: powershell -File make-icon.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$assets = Join-Path (Split-Path -Parent $PSScriptRoot) "CadastroClinicoMSIX\Assets"
$srcPath = Join-Path $assets "clinic-logo.jpg"
$outPath = Join-Path $assets "app-icon.ico"
$sizes = @(16, 24, 32, 48, 64, 128, 256)

$img = [System.Drawing.Image]::FromFile($srcPath)

function Get-IconEntry([int]$size, $img) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = "HighQualityBicubic"
    $g.SmoothingMode = "HighQuality"
    $g.PixelOffsetMode = "HighQuality"
    $scale = [Math]::Min($size * 0.88 / $img.Width, $size * 0.88 / $img.Height)
    $dw = [Math]::Max(1, [int]($img.Width * $scale))
    $dh = [Math]::Max(1, [int]($img.Height * $scale))
    $g.DrawImage($img, [int](($size - $dw) / 2), [int](($size - $dh) / 2), $dw, $dh)
    $g.Dispose()

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $raw = New-Object byte[] ($stride * $size)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
    $bmp.UnlockBits($data)
    $bmp.Dispose()

    # BMP do ICO e bottom-up; memoria vem top-down -> inverte linhas
    $rowSize = $size * 4
    $xor = New-Object byte[] ($rowSize * $size)
    for ($y = 0; $y -lt $size; $y++) {
        [Array]::Copy($raw, $y * $stride, $xor, ($size - 1 - $y) * $rowSize, $rowSize)
    }

    $andStride = [Math]::Ceiling($size / 32) * 4
    $and = New-Object byte[] ($andStride * $size)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([uint32]40)                  # biSize
    $bw.Write([int32]$size)                # biWidth
    $bw.Write([int32]($size * 2))          # biHeight (x2: XOR + AND)
    $bw.Write([uint16]1)                   # biPlanes
    $bw.Write([uint16]32)                  # biBitCount
    $bw.Write([uint32]0)                   # biCompression = BI_RGB
    $bw.Write([uint32]($rowSize * $size))  # biSizeImage
    $bw.Write([int32]0); $bw.Write([int32]0)
    $bw.Write([uint32]0); $bw.Write([uint32]0)
    $bw.Write($xor)
    $bw.Write($and)
    $bw.Flush()
    return , $ms.ToArray()   # vrgula unaria: impede o PowerShell de desmembrar o byte[]
}

$entries = @()
foreach ($s in $sizes) { $entries += ,@{ size = $s; data = (Get-IconEntry $s $img) } }
$img.Dispose()

$fs = [System.IO.File]::Create($outPath)
$w = New-Object System.IO.BinaryWriter($fs)
$w.Write([uint16]0)                      # reserved
$w.Write([uint16]1)                      # type = icon
$w.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
    $b = $e.data
    $dim = if ($e.size -ge 256) { 0 } else { [byte]$e.size }
    $w.Write([byte]$dim)                 # width (0 = 256)
    $w.Write([byte]$dim)                 # height
    $w.Write([byte]0)                    # color count
    $w.Write([byte]0)                    # reserved
    $w.Write([uint16]1)                  # planes
    $w.Write([uint16]32)                 # bit count
    $w.Write([uint32]$b.Length)
    $w.Write([uint32]$offset)
    $offset += $b.Length
}
foreach ($e in $entries) { $w.Write($e.data) }
$w.Flush(); $fs.Close()

$check = New-Object System.Drawing.Icon($outPath)
"gerado: $outPath ($($check.Width)x$($check.Height), $((Get-Item $outPath).Length) bytes)"
$check.Dispose()
