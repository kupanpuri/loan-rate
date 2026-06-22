$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$TaskName = "Painel Loan Snapshot"
$NodeNpm = "C:\Program Files\nodejs\npm.cmd"

$Action = New-ScheduledTaskAction `
  -Execute $NodeNpm `
  -Argument "run snapshot" `
  -WorkingDirectory $ProjectDir

$TriggerMidnight = New-ScheduledTaskTrigger -Daily -At 00:00
$TriggerMorning = New-ScheduledTaskTrigger -Daily -At 06:00
$TriggerNoon = New-ScheduledTaskTrigger -Daily -At 12:00
$TriggerEvening = New-ScheduledTaskTrigger -Daily -At 18:00

$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger @($TriggerMidnight, $TriggerMorning, $TriggerNoon, $TriggerEvening) `
  -Settings $Settings `
  -Description "Atualiza o snapshot do dashboard de loans 4x por dia." `
  -Force

Write-Host "Scheduled task registered: $TaskName"
