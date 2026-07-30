param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'

$moduleRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $moduleRoot 'module.json') -Raw |
  ConvertFrom-Json

if ($manifest.id -ne 'gm-combat-workspace') {
  throw 'Unexpected module id. Packaging stopped.'
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'gm-combat-workspace-package-' + [guid]::NewGuid().ToString('N')
)
$moduleStage = Join-Path $stagingRoot $manifest.id
$zipPath = Join-Path $resolvedOutput ($manifest.id + '.zip')

try {
  New-Item -ItemType Directory -Path $moduleStage -Force | Out-Null
  New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

  $files = @(
    '.gitignore',
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'ROADMAP.md',
    'TESTING.md',
    'module.json'
  )
  $directories = @('lang', 'scripts', 'styles')

  foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $moduleRoot $file) -Destination $moduleStage
  }

  foreach ($directory in $directories) {
    Copy-Item -LiteralPath (Join-Path $moduleRoot $directory) -Destination $moduleStage -Recurse
  }

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath
  }

  Compress-Archive -LiteralPath $moduleStage -DestinationPath $zipPath
  Write-Output $zipPath
}
finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())

    if ($resolvedStaging.StartsWith($resolvedTemp) -and
        $resolvedStaging -like '*gm-combat-workspace-package-*') {
      Remove-Item -LiteralPath $resolvedStaging -Recurse
    }
  }
}
