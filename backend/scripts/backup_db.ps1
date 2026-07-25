<#
  backup_db.ps1
  Backup automático de la base de MongoDB de BolsonesControl.
#>

$EnvFile        = Join-Path $PSScriptRoot "..\.env"
$BackupRoot     = "C:\BolsonesBackups"
$DiasARetener   = 14
$UsbDriveLetter = "E:\"

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $BackupRoot "backup_log.txt"

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

try {
    if (-not (Test-Path $BackupRoot)) {
        New-Item -ItemType Directory -Path $BackupRoot | Out-Null
    }

    if (-not (Test-Path $EnvFile)) {
        throw "No encontré el archivo .env en $EnvFile"
    }
    $envContent = Get-Content $EnvFile
    $mongoUrl = ($envContent | Where-Object { $_ -match '^\s*MONGO_URL\s*=' }) -replace '^\s*MONGO_URL\s*=\s*', ''
    $dbName   = ($envContent | Where-Object { $_ -match '^\s*DB_NAME\s*=' })   -replace '^\s*DB_NAME\s*=\s*', ''
    if (-not $mongoUrl -or -not $dbName) {
        throw "No pude leer MONGO_URL o DB_NAME desde $EnvFile"
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $dumpFolder = Join-Path $BackupRoot "dump_$timestamp"
    Write-Log "Iniciando backup de '$dbName' -> $dumpFolder"

    # El progreso de mongodump se guarda tal cual en el log, sin tratarlo como error.
    # Lo único que decide si falló de verdad es el código de salida ($LASTEXITCODE).
    $mongoOutput = & mongodump --uri="$mongoUrl" --db="$dbName" --out="$dumpFolder" 2>&1 | Out-String
    Add-Content -Path $LogFile -Value $mongoOutput

    if ($LASTEXITCODE -ne 0) {
        throw "mongodump terminó con código de error $LASTEXITCODE"
    }

    $zipPath = Join-Path $BackupRoot "backup_$timestamp.zip"
    Compress-Archive -Path $dumpFolder -DestinationPath $zipPath -Force
    Remove-Item -Recurse -Force $dumpFolder
    Write-Log "Backup comprimido: $zipPath"

    if ($UsbDriveLetter -and (Test-Path $UsbDriveLetter)) {
        $usbDest = Join-Path $UsbDriveLetter "BolsonesBackups"
        if (-not (Test-Path $usbDest)) { New-Item -ItemType Directory -Path $usbDest | Out-Null }
        Copy-Item $zipPath -Destination $usbDest -Force
        Write-Log "Copia extra en USB: $usbDest"
    } elseif ($UsbDriveLetter) {
        Write-Log "USB ($UsbDriveLetter) no detectada, se omite copia extra."
    }

    $limite = (Get-Date).AddDays(-$DiasARetener)
    Get-ChildItem -Path $BackupRoot -Filter "backup_*.zip" |
        Where-Object { $_.LastWriteTime -lt $limite } |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Write-Log "Backup viejo borrado (rotación): $($_.Name)"
        }

    Write-Log "Backup finalizado OK."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}