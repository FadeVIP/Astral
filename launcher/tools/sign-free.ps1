param([string]$Exe = '', [switch]$ExportCertificate)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Exe)) { $Exe = Join-Path $projectRoot 'dist\Astral-Launcher-0.3.1-x64.exe' }
if (-not (Test-Path -LiteralPath $Exe)) { throw "EXE не найден: $Exe" }
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=RikiMarci Studio' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=RikiMarci Studio' -FriendlyName 'RikiMarci Studio Free Code Signing' -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(3)
}
$signtool = Join-Path $PSScriptRoot '..\node_modules\@electron\windows-sign\vendor\signtool.exe'
if (-not (Test-Path -LiteralPath $signtool)) { throw 'signtool.exe не найден. Сначала выполните npm ci в папке launcher.' }
$sourceExe = (Resolve-Path -LiteralPath $Exe).Path
$Exe = Join-Path ([IO.Path]::GetDirectoryName($sourceExe)) ([IO.Path]::GetFileNameWithoutExtension($sourceExe) + '-signed.exe')
Copy-Item -LiteralPath $sourceExe -Destination $Exe
& $signtool sign /sha1 $cert.Thumbprint /fd SHA256 /d 'Astral Launcher' $Exe
if ($LASTEXITCODE -ne 0) { throw "Подпись EXE завершилась с ошибкой ($LASTEXITCODE)" }
$signature = Get-AuthenticodeSignature -LiteralPath $Exe
if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $cert.Thumbprint) { throw 'Сертификат в подписи EXE не совпадает с выбранным' }
if ($signature.Status -in @('HashMismatch','NotSigned','NotSupported','Incompatible')) { throw "Подпись повреждена: $($signature.Status)" }
# A self-signed certificate is intentionally NOT installed into Trusted Root.
Write-Host "Проверка Windows: $($signature.Status) — $($signature.StatusMessage)"
$hash = (Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($Exe + '.sha256'), ($hash + '  ' + [IO.Path]::GetFileName($Exe) + [Environment]::NewLine))
if ($ExportCertificate) {
  $publicCert = Join-Path (Split-Path -Parent $Exe) 'RikiMarci-Studio-Free.cer'
  Export-Certificate -Cert $cert -FilePath $publicCert | Out-Null
  Write-Host "Публичный сертификат: $publicCert"
}
Write-Host "EXE подписан: $Exe"
Write-Host "Издатель: $($cert.Subject)"
Write-Host "Сертификат действует до: $($cert.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host 'Важно: самоподписанный сертификат бесплатный, но Windows у других пользователей может показать предупреждение.'
