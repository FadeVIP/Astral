param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference = 'Stop'
$job = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
$replaced = $false
$movedOriginal = $false
$pathsValidated = $false
function Get-UpdateHash([string]$File) {
  $stream = [IO.File]::OpenRead($File)
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose(); $stream.Dispose() }
}
try {
  foreach ($item in @($job.source, $job.target, $job.stage, $job.backup)) {
    if ($item -notmatch '^[A-Za-z]:[\\/]') { throw 'An absolute local path is required' }
  }
  $target = [IO.Path]::GetFullPath($job.target)
  $folder = [IO.Path]::GetDirectoryName($target)
  if ([IO.Path]::GetExtension($target) -ne '.exe') { throw 'Unexpected target type' }
  foreach ($item in @($job.stage, $job.backup)) {
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($item)) -ne $folder -or $item -eq $target) { throw 'Unexpected update path' }
  }
  if ($job.stage -eq $job.backup -or $job.source -eq $target) { throw 'Update paths overlap' }
  if ((Test-Path -LiteralPath $job.stage) -or (Test-Path -LiteralPath $job.backup)) { throw 'Update destination already exists' }
  $pathsValidated = $true
  if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Target is a link' }
  if ((Get-Item -LiteralPath $target).PSIsContainer) { throw 'Target is not a file' }
  if ((Get-Item -LiteralPath $job.source).Length -ne $job.bytes -or (Get-UpdateHash $job.source) -ne $job.sha256) { throw 'Update checksum mismatch' }
  [IO.File]::WriteAllText(($JobFile + '.ready'), 'READY')
  if ($job.parentPid -gt 0) {
    $parent = Get-Process -Id $job.parentPid -ErrorAction SilentlyContinue
    if ($parent -and -not $parent.WaitForExit(120000)) { throw 'Launcher did not exit' }
  }
  Copy-Item -LiteralPath $job.source -Destination $job.stage -ErrorAction Stop
  if ((Get-UpdateHash $job.stage) -ne $job.sha256) { throw 'Staged checksum mismatch' }
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { Move-Item -LiteralPath $target -Destination $job.backup -ErrorAction Stop; $movedOriginal = $true; break }
    catch { if ($attempt -eq 59) { throw }; Start-Sleep -Seconds 1 }
  }
  Move-Item -LiteralPath $job.stage -Destination $target -ErrorAction Stop
  $replaced = $true
  if ($job.restart) { Start-Process -FilePath $target -WorkingDirectory $folder -WindowStyle Hidden -ErrorAction Stop | Out-Null }
  [IO.File]::WriteAllText(($JobFile + '.result'), 'UPDATED')
} catch {
  if ($replaced -and $movedOriginal) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
  if ($movedOriginal) {
    Move-Item -LiteralPath $job.backup -Destination $target -ErrorAction SilentlyContinue
    if ($job.restart) { Start-Process -FilePath $target -WorkingDirectory $folder -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null }
  }
  [IO.File]::WriteAllText(($JobFile + '.result'), 'FAILED: ' + $_.Exception.Message)
  exit 1
} finally {
  if ($pathsValidated -and (Test-Path -LiteralPath $job.stage)) { Remove-Item -LiteralPath $job.stage -Force -ErrorAction SilentlyContinue }
}
