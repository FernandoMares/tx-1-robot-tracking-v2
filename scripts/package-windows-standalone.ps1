[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $distRoot "tx1-tracking-windows"))
$archivePath = [IO.Path]::GetFullPath((Join-Path $distRoot "tx1-tracking-windows.zip"))
$distPrefix = $distRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (
  -not $releaseRoot.StartsWith($distPrefix, [StringComparison]::OrdinalIgnoreCase) -or
  -not $archivePath.StartsWith($distPrefix, [StringComparison]::OrdinalIgnoreCase)
) {
  throw "Unsafe package target outside the project dist directory."
}

$buildVariables = [ordered]@{
  NEXT_PUBLIC_PLANT_DATA_MODE = "live"
  NEXT_PUBLIC_TRACKING_API_URL = "/tracking-api"
  NEXT_PUBLIC_TRACKING_POLL_MS = "1000"
  NEXT_PUBLIC_TRACKING_STALE_MS = "3500"
  NEXT_PUBLIC_TRACKING_TIMEOUT_MS = "4000"
}
$previousValues = @{}

foreach ($entry in $buildVariables.GetEnumerator()) {
  $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
}

Push-Location $projectRoot
try {
  & pnpm exec next build
  if ($LASTEXITCODE -ne 0) {
    throw "Next.js production build failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
  foreach ($entry in $buildVariables.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $previousValues[$entry.Key], "Process")
  }
}

$standaloneSource = Join-Path $projectRoot ".next\standalone"
$staticSource = Join-Path $projectRoot ".next\static"
$publicSource = Join-Path $projectRoot "public"
$windowsFilesSource = Join-Path $projectRoot "deployment\windows"

foreach ($requiredPath in @($standaloneSource, $staticSource, $publicSource, $windowsFilesSource)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required package input was not generated or is missing: $requiredPath"
  }
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

if (Test-Path -LiteralPath $releaseRoot) {
  Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
Get-ChildItem -LiteralPath $standaloneSource -Force |
  Copy-Item -Destination $releaseRoot -Recurse -Force

# Next.js standalone output produced from pnpm on Windows can retain junctions
# whose targets live in the build workspace. Copy-Item materializes the direct
# packages, but their pnpm-managed siblings can remain only in the virtual
# store. Flatten those traced runtime packages into the release node_modules so
# the extracted ZIP never depends on the original repository path.
$releaseNodeModules = Join-Path $releaseRoot "node_modules"
$releasePnpmStore = Join-Path $releaseNodeModules ".pnpm"

if (Test-Path -LiteralPath $releasePnpmStore) {
  foreach ($virtualPackage in Get-ChildItem -LiteralPath $releasePnpmStore -Directory -Force) {
    $virtualModules = Join-Path $virtualPackage.FullName "node_modules"
    if (-not (Test-Path -LiteralPath $virtualModules)) {
      continue
    }

    foreach ($packageEntry in Get-ChildItem -LiteralPath $virtualModules -Directory -Force) {
      if ($packageEntry.Name -eq ".bin") {
        continue
      }

      if ($packageEntry.Name.StartsWith("@", [StringComparison]::Ordinal)) {
        $releaseScope = Join-Path $releaseNodeModules $packageEntry.Name
        New-Item -ItemType Directory -Path $releaseScope -Force | Out-Null

        foreach ($scopedPackage in Get-ChildItem -LiteralPath $packageEntry.FullName -Directory -Force) {
          $destination = Join-Path $releaseScope $scopedPackage.Name
          if (-not (Test-Path -LiteralPath $destination)) {
            Copy-Item -LiteralPath $scopedPackage.FullName -Destination $destination -Recurse -Force
          }
        }
      }
      else {
        $destination = Join-Path $releaseNodeModules $packageEntry.Name
        if (-not (Test-Path -LiteralPath $destination)) {
          Copy-Item -LiteralPath $packageEntry.FullName -Destination $destination -Recurse -Force
        }
      }
    }
  }
}

Copy-Item -LiteralPath $publicSource -Destination $releaseRoot -Recurse -Force

$releaseNextRoot = Join-Path $releaseRoot ".next"
New-Item -ItemType Directory -Path $releaseNextRoot -Force | Out-Null
Copy-Item -LiteralPath $staticSource -Destination $releaseNextRoot -Recurse -Force

Copy-Item -LiteralPath (Join-Path $windowsFilesSource "start.cmd") -Destination $releaseRoot -Force
Copy-Item -LiteralPath (Join-Path $windowsFilesSource "README.txt") -Destination $releaseRoot -Force

$commit = "unknown"
$commitSubject = "unknown"
try {
  $commit = (& git -C $projectRoot rev-parse HEAD).Trim()
  $commitSubject = (& git -C $projectRoot log -1 --pretty=%s).Trim()
}
catch {
  Write-Warning "Git metadata was unavailable; RELEASE.txt will use unknown values."
}

@(
  "TX1 Tracking HMI standalone release"
  "BuiltUtc=$([DateTime]::UtcNow.ToString('o'))"
  "GitCommit=$commit"
  "GitSubject=$commitSubject"
  "PlantDataMode=live"
) | Set-Content -LiteralPath (Join-Path $releaseRoot "RELEASE.txt") -Encoding utf8

foreach ($requiredOutput in @(
  (Join-Path $releaseRoot "server.js"),
  (Join-Path $releaseRoot "node_modules\@swc\helpers"),
  (Join-Path $releaseRoot ".next\static"),
  (Join-Path $releaseRoot "public"),
  (Join-Path $releaseRoot "start.cmd")
)) {
  if (-not (Test-Path -LiteralPath $requiredOutput)) {
    throw "Standalone package validation failed; missing: $requiredOutput"
  }
}

Compress-Archive -Path $releaseRoot -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host ""
Write-Host "Windows standalone package created successfully:"
Write-Host "  Folder: $releaseRoot"
Write-Host "  ZIP:    $archivePath"
Write-Host ""
Write-Host "Extract the ZIP on the target server and run start.cmd from the extracted folder."
