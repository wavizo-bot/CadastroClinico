$ErrorActionPreference = "Stop"

$msixDir  = $PSScriptRoot
$rootDir  = Split-Path -Parent $msixDir
$proj     = Join-Path $msixDir "CadastroClinicoMSIX\CadastroClinicoMSIX.csproj"
$manifest = Join-Path $msixDir "CadastroClinicoMSIX\Package.appxmanifest"
$assets   = Join-Path $msixDir "CadastroClinicoMSIX\Assets"
$publish  = Join-Path $msixDir "bin\publish-win-x64"
$layout   = Join-Path $msixDir "bin\msix-layout"
$outDir   = Join-Path $msixDir "dist"
$exeName  = "CadastroClinicoMSIX.exe"

# --- 1) pacote web ----------------------------------------------------------
Write-Host "[1/5] Build web (vite)..."
Push-Location $rootDir
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Falha no build web (pnpm run build)." }
}
finally { Pop-Location }

# --- 2) publish .NET autocontido (win-x64) ----------------------------------
Write-Host "[2/5] dotnet publish (self-contained win-x64)..."
if (Test-Path $publish) { Remove-Item $publish -Recurse -Force }
dotnet publish $proj -c Release -r win-x64 --self-contained true -o $publish /p:DebugType=none
if ($LASTEXITCODE -ne 0) { throw "Falha no dotnet publish." }

# --- 3) layout do pacote ----------------------------------------------------
Write-Host "[3/5] Montando layout MSIX..."
if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }
New-Item -ItemType Directory -Path $layout -Force | Out-Null
Copy-Item -Path "$publish\*" -Destination $layout -Recurse -Force
Get-ChildItem $layout -Recurse -Filter *.pdb | Remove-Item -Force

$manifestRefs = @("StoreLogo.png","Square44x44Logo.png","Square150x150Logo.png","Wide310x150Logo.png","SplashScreen.png")
New-Item -ItemType Directory -Path (Join-Path $layout "Assets") -Force | Out-Null
foreach ($f in $manifestRefs) {
    Copy-Item -LiteralPath (Join-Path $assets $f) -Destination (Join-Path $layout "Assets\$f") -Force
}

# AppxManifest.xml: mesmo manifesto do projeto, com o token do executavel resolvido
# Leitura como UTF-8 explicito (senao o PS 5.1 le como ANSI e duplica os acentos)
$appxManifest = [IO.File]::ReadAllText($manifest, [Text.Encoding]::UTF8) -replace '\$targetnametoken\$', ([IO.Path]::GetFileNameWithoutExtension($exeName))
[IO.File]::WriteAllText((Join-Path $layout "AppxManifest.xml"), $appxManifest, (New-Object System.Text.UTF8Encoding($false)))

if (-not (Test-Path (Join-Path $layout "web\index.html"))) { throw "web\index.html ausente no layout - dist/public foi gerado?" }
if (-not (Test-Path (Join-Path $layout $exeName))) { throw "$exeName ausente no layout." }

# --- 4) makeappx ------------------------------------------------------------
Write-Host "[4/5] Empacotando (.msix)..."
$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.*\x64\makeappx.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $makeappx) { throw "makeappx.exe nao encontrado (Windows SDK 10.x)." }

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$version = ([xml](Get-Content -LiteralPath $manifest -Raw)).Package.Identity.Version
$outMsix = Join-Path $outDir "wavizo.CadastroClnico_$version`_x64.msix"
& $makeappx pack /d $layout /p $outMsix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx falhou." }

# --- 5) validacao estrutural ------------------------------------------------
Write-Host "[5/5] Validando pacote..."
$check = Join-Path $msixDir "bin\msix-check"
if (Test-Path $check) { Remove-Item $check -Recurse -Force }
& (Join-Path (Split-Path $makeappx) "makeappx.exe") unpack /p $outMsix /d $check /o | Out-Null
if ($LASTEXITCODE -ne 0) { throw "makeappx unpack (validacao) falhou." }
foreach ($f in @("AppxManifest.xml", $exeName, "web\index.html", "Assets\StoreLogo.png", "Microsoft.Web.WebView2.Core.dll")) {
    if (-not (Test-Path (Join-Path $check $f))) { throw "Pacote invalido, falta: $f" }
}
[xml]$m = Get-Content -LiteralPath (Join-Path $check "AppxManifest.xml") -Raw
if ($m.Package.Identity.Name -ne "wavizo.CadastroClnico") { throw "Identity errada no pacote." }
if ($m.Package.Identity.Publisher -ne "CN=57BB464E-553F-45B6-A4ED-B253157408EB") { throw "Publisher errado no pacote." }
Remove-Item $check -Recurse -Force

$size = [math]::Round((Get-Item $outMsix).Length / 1MB, 1)
Write-Host ""
Write-Host "OK: $outMsix ($size MB) - pronto para upload no Partner Center (Packages)."
