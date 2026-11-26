[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SdkRoot,
    [Parameter(Mandatory)][string]$JdkRoot,
    [Parameter(Mandatory)][string]$Keystore,
    [Parameter(Mandatory)][string]$SigningPasswordFile,
    [switch]$Qa,
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildRoot = Join-Path $project 'build'
$entry = Join-Path $project 'android/app/src/main'
$androidJar = Join-Path $SdkRoot 'platforms/android-35/android.jar'
$tools = Join-Path $SdkRoot 'build-tools/35.0.0'
$java = Join-Path $JdkRoot 'bin/java.exe'
$javac = Join-Path $JdkRoot 'bin/javac.exe'
$aapt = Join-Path $tools 'aapt2.exe'
$zipalign = Join-Path $tools 'zipalign.exe'
$d8 = Join-Path $tools 'lib/d8.jar'
$signer = Join-Path $tools 'lib/apksigner.jar'
$password = (Resolve-Path -LiteralPath $SigningPasswordFile).Path
$keystorePath = (Resolve-Path -LiteralPath $Keystore).Path

function Invoke-Tool([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$([IO.Path]::GetFileName($Program)) exited with code $LASTEXITCODE"
    }
}

foreach ($required in @($java, $javac, $aapt, $zipalign, $d8, $signer, $androidJar)) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing SDK tool: $required" }
}

if (!$SkipWebBuild) {
    Push-Location -LiteralPath $project
    try { Invoke-Tool 'pnpm' @('run', 'build') } finally { Pop-Location }
}
if (!(Test-Path -LiteralPath (Join-Path $project 'dist/index.html') -PathType Leaf)) {
    throw 'The web bundle has not been built.'
}

$stage = Join-Path $buildRoot ('android-stage-' + [Guid]::NewGuid().ToString('N'))
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'
$webAssets = Join-Path $project 'dist'
New-Item -ItemType Directory -Path $classes, $dex -Force | Out-Null

try {
    $stagedPlatform = Join-Path $stage 'android.jar'
    Copy-Item -LiteralPath $androidJar -Destination $stagedPlatform
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $entry 'AndroidManifest.xml') -Raw -Encoding UTF8
    $android = 'http://schemas.android.com/apk/res/android'
    $manifestPackage = $manifest.DocumentElement.GetAttribute('package')
    if ($Qa) {
        $manifest.DocumentElement.SetAttribute('package', "$manifestPackage.qa")
        [void]$manifest.manifest.application.SetAttribute('debuggable', $android, 'true')
        [void]$manifest.manifest.application.SetAttribute('label', $android, 'DS 对话 QA')
        foreach ($provider in $manifest.SelectNodes('/manifest/application/provider')) {
            $authority = $provider.GetAttribute('authorities', $android)
            if ($authority.StartsWith("$manifestPackage.")) {
                $suffix = $authority.Substring($manifestPackage.Length)
                [void]$provider.SetAttribute('authorities', $android, "$manifestPackage.qa$suffix")
            }
        }
    }
    $manifestPath = Join-Path $stage 'AndroidManifest.xml'
    $manifest.Save($manifestPath)

    $sources = @(Get-ChildItem -LiteralPath (Join-Path $entry 'java') -Recurse -File -Filter '*.java' |
        Select-Object -ExpandProperty FullName)
    $bootPath = (Join-Path $tools 'core-lambda-stubs.jar') + ';' + $androidJar
    Invoke-Tool $javac (@('-J-Duser.language=en','-Xlint:-options','-encoding','UTF-8','-source','8','-target','8',
        '-bootclasspath',$bootPath,'-d',$classes) + $sources)
    $classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -File -Filter '*.class' |
        Select-Object -ExpandProperty FullName)
    Invoke-Tool $java (@('-Xmx384m','-cp',$d8,'com.android.tools.r8.D8','--release',
        '--min-api','26','--lib',$androidJar,'--output',$dex) + $classFiles)

    $appResources = Join-Path $stage 'res'
    Copy-Item -LiteralPath (Join-Path $entry 'res') -Destination $appResources -Recurse
    $iconDirectory = Join-Path $appResources 'drawable-nodpi'
    New-Item -ItemType Directory -Path $iconDirectory | Out-Null
    Copy-Item -LiteralPath (Join-Path $project 'src/assets/ds-dolphin.png') -Destination (Join-Path $iconDirectory 'ds_dolphin.png')
    $resources = Join-Path $stage 'resources.zip'
    Invoke-Tool $aapt @('compile','--dir',$appResources,'-o',$resources)
    $unsigned = Join-Path $stage 'unsigned.apk'
    Invoke-Tool $aapt @('link','-I',$stagedPlatform,'--manifest',$manifestPath,
        '--min-sdk-version','26','--target-sdk-version','35','-o',$unsigned,$resources)
    Add-Type -AssemblyName System.IO.Compression
    $archive = [IO.Compression.ZipFile]::Open($unsigned, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($file in (Get-ChildItem -LiteralPath $dex -File -Filter '*.dex')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $file.FullName, $file.Name, [IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
        # Android asset paths use slash separators, including in APKs built on Windows.
        foreach ($file in (Get-ChildItem -LiteralPath $webAssets -File -Recurse)) {
            $relative = [IO.Path]::GetRelativePath($webAssets, $file.FullName).Replace('\','/')
            if ($relative -notmatch '^(index\.html|LICENSE|static/[A-Za-z0-9_./-]+)$' -or
                $relative.Contains('..') -or
                ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw "Unexpected web asset: $relative"
            }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $file.FullName, "assets/www/$relative", [IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
        if (!$archive.GetEntry('assets/www/index.html')) { throw 'APK is missing its HTML entry.' }
    } finally {
        $archive.Dispose()
    }

    $aligned = Join-Path $stage 'aligned.apk'
    Invoke-Tool $zipalign @('-f','4',$unsigned,$aligned)
    $candidate = Join-Path $stage 'signed.apk'
    Invoke-Tool $java @('-jar',$signer,'sign','--ks',$keystorePath,'--ks-key-alias','ds-mobile',
        '--ks-pass',("file:$password"),'--out',$candidate,$aligned)
    Invoke-Tool $java @('-jar',$signer,'verify','--verbose','--print-certs',$candidate)
    Invoke-Tool $zipalign @('-c','4',$candidate)

    $version = $manifest.DocumentElement.GetAttribute('versionName', $android)
    $suffix = if ($Qa) { 'qa' } else { 'android' }
    $result = Join-Path $buildRoot "ds-chat-$version-$suffix.apk"
    Copy-Item -LiteralPath $candidate -Destination $result -Force
    Get-FileHash -Algorithm SHA256 -LiteralPath $result
} finally {
    $resolved = [IO.Path]::GetFullPath($stage)
    if ((Split-Path -Parent $resolved) -eq $buildRoot -and
        (Split-Path -Leaf $resolved) -match '^android-stage-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
