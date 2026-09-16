Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background rounded rect (Blue Gradient)
$rect = New-Object System.Drawing.Rectangle 16, 16, 224, 224
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(37, 99, 235),  # Royal Blue
    [System.Drawing.Color]::FromArgb(30, 58, 138),  # Deep Navy
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)

# Draw rounded rectangle
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 48
$d = $r * 2
$path.AddArc(16, 16, $d, $d, 180, 90)
$path.AddArc(240 - $d, 16, $d, $d, 270, 90)
$path.AddArc(240 - $d, 240 - $d, $d, $d, 0, 90)
$path.AddArc(16, 240 - $d, $d, $d, 90, 90)
$path.CloseFigure()

$g.FillPath($brush, $path)

# Draw White Lab Notebook / Flask Symbol
$whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 12
$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Notebook outline
$g.DrawLine($whitePen, 70, 60, 186, 60)
$g.DrawLine($whitePen, 186, 60, 186, 196)
$g.DrawLine($whitePen, 186, 196, 70, 196)
$g.DrawLine($whitePen, 70, 196, 70, 60)

# Inner lines of notebook
$thinPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 255, 255, 255)), 8
$thinPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$thinPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawLine($thinPen, 96, 95, 160, 95)
$g.DrawLine($thinPen, 96, 128, 160, 128)
$g.DrawLine($thinPen, 96, 161, 140, 161)

# Save PNG and ICO
$outDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$pngPath = Join-Path $outDir "app_icon.png"
$icoPath = Join-Path $outDir "app_icon.ico"

$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Convert to ICO
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fileStream = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($fileStream)
$fileStream.Close()

# Also copy to static directory
$staticDir = Join-Path $outDir "static"
if (Test-Path $staticDir) {
    Copy-Item $pngPath (Join-Path $staticDir "app_icon.png") -Force
    Copy-Item $icoPath (Join-Path $staticDir "app_icon.ico") -Force
    Copy-Item $icoPath (Join-Path $staticDir "favicon.ico") -Force
}

$g.Dispose()
$bmp.Dispose()

Write-Host "Icons generated successfully at: $icoPath and copied to static/"
