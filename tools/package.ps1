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
$zipPath = Join-Path $resolvedOutput ($manifest.id + '.zip')

$files = @(
  '.gitignore',
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'ROADMAP.md',
  'TESTING.md',
  'module.json'
)

foreach ($directory in @('lang', 'scripts', 'styles')) {
  $directoryPath = Join-Path $moduleRoot $directory

  $files += Get-ChildItem -LiteralPath $directoryPath -Recurse -File |
    ForEach-Object {
      $_.FullName.Substring($moduleRoot.Length).TrimStart(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
      )
    }
}

$files = $files | Sort-Object -Unique

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression

$zipStream = [System.IO.File]::Open(
  $zipPath,
  [System.IO.FileMode]::CreateNew,
  [System.IO.FileAccess]::ReadWrite,
  [System.IO.FileShare]::None
)

try {
  $archive = [System.IO.Compression.ZipArchive]::new(
    $zipStream,
    [System.IO.Compression.ZipArchiveMode]::Create,
    $true
  )

  try {
    foreach ($relativePath in $files) {
      $sourcePath = Join-Path $moduleRoot $relativePath
      $entryPath = (
        $manifest.id + '/' + $relativePath.Replace('\', '/')
      )

      $entry = $archive.CreateEntry(
        $entryPath,
        [System.IO.Compression.CompressionLevel]::Optimal
      )

      # A fixed timestamp makes repeated builds byte-stable.
      $entry.LastWriteTime = [DateTimeOffset]::new(
        2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero
      )

      $sourceStream = [System.IO.File]::OpenRead($sourcePath)
      $entryStream = $entry.Open()

      try {
        $sourceStream.CopyTo($entryStream)
      }
      finally {
        $entryStream.Dispose()
        $sourceStream.Dispose()
      }
    }
  }
  finally {
    $archive.Dispose()
  }
}
finally {
  $zipStream.Dispose()
}

Write-Output $zipPath
