<#
  setup_backup_task.ps1
  Registra en el Programador de Tareas de Windows una tarea diaria que corre
  backup_db.ps1. Correr ESTE script UNA SOLA VEZ (como Administrador).

  Cómo correrlo como administrador:
    1. Click derecho en PowerShell -> "Ejecutar como administrador"
    2. cd a esta carpeta (backend\scripts)
    3. powershell -ExecutionPolicy Bypass -File setup_backup_task.ps1
#>

$TaskName    = "BolsonesControl - Backup diario"
$ScriptPath  = Join-Path $PSScriptRoot "backup_db.ps1"
$HoraCorrida = "23:30"   # a qué hora corre el backup todos los días (formato 24hs)

$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $HoraCorrida
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Backup automático de MongoDB de BolsonesControl" -Force

Write-Host ""
Write-Host "Tarea '$TaskName' registrada. Corre todos los días a las $HoraCorrida."
Write-Host "Para probarla ahora mismo sin esperar: Start-ScheduledTask -TaskName '$TaskName'"