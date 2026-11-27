# yonder: Yonder on Windows ("Windows" in docs/wiki.md). The loop of `yonder serve` runs the bridge from the log-in.
#
#   yonder open       Bring the Yonder window to the front, or open it.
#   yonder call       Start or end a call (Ctrl + Alt + Y). With no window open, it opens one first.
#   yonder pair       Show the QR code that pairs a phone, and wait until a phone scans it.
#   yonder update     Install the newest Yonder.
#   yonder restart    Start the bridge again.
#   yonder logs       Follow the log of the bridge.
#   yonder uninstall  Remove Yonder. The settings and the pairings in ~\.config\yonder stay.
#
# The Startup folder runs `yonder serve`, and the installer runs `yonder stop` before it replaces the files.
# This file is ASCII, because Windows PowerShell reads a script with no BOM in the code page of the system.
param([string]$Command = 'help')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Bridge = 'http://127.0.0.1:7787'
$Data = $PSScriptRoot
$Config = Join-Path $HOME '.config\yonder'
$Log = Join-Path $Config 'bridge.log'
# The profile of the window. It is not in the folder of the install, which an update replaces, so the sign-in stays.
$WindowProfile = Join-Path $Config 'window'
$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Get-Bridge([string]$Path, [string]$Method = 'Get') {
  Invoke-RestMethod -UseBasicParsing -Method $Method -Uri "$Bridge$Path" -TimeoutSec 5
}

# The windows that listen for the call key (GET /events of the bridge).
function Get-Windows {
  try { (Get-Bridge '/call').windows } catch { 0 }
}

# A short message for a command with no console, such as the call key: it closes after 5 seconds.
function Show-Note([string]$Text) {
  $null = (New-Object -ComObject WScript.Shell).Popup($Text, 5, 'Yonder', 48)
}

# The window: the page of the bridge in Edge, with a profile of its own. So the browser of the user does not take the
# window, and the flags apply: --autoplay-policy lets the call key start the sound of a call with no click.
function Open-Window {
  if ((Get-Windows) -gt 0) {
    $null = (New-Object -ComObject WScript.Shell).AppActivate('Yonder')
    return
  }
  Start-Process msedge -ArgumentList "--app=$Bridge/", "--user-data-dir=`"$WindowProfile`"",
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check'
}

# The loops of `yonder serve`, found by their command line.
function Get-Serve {
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -like '*yonder.ps1*serve*' }
}

# Stops the loop first, so that it does not start the bridge again. The workers of Claude Code keep running.
function Stop-Yonder {
  Get-Serve | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-Process yonder-bridge -ErrorAction SilentlyContinue | Stop-Process -Force -PassThru | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
}

function Start-Yonder {
  Start-Process $PowerShell -WindowStyle Hidden -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`"", 'serve'
}

# The QR code in the console, two rows of modules in each line. The light modules are blocks in white on black, so
# the code reads the same in a dark and a light terminal.
function Show-Qr([string]$DataUrl) {
  Add-Type -AssemblyName System.Drawing
  $bytes = [Convert]::FromBase64String($DataUrl.Substring($DataUrl.IndexOf(',') + 1))
  $image = New-Object System.Drawing.Bitmap (New-Object System.IO.MemoryStream (, $bytes))
  $light = { param($x, $y) $y -ge $image.Height -or $image.GetPixel($x, $y).GetBrightness() -gt 0.5 }
  $full, $upper, $lower = [char]0x2588, [char]0x2580, [char]0x2584
  for ($y = 0; $y -lt $image.Height; $y += 2) {
    $line = -join (0..($image.Width - 1) | ForEach-Object {
        $top = & $light $_ $y
        $bottom = & $light $_ ($y + 1)
        if ($top -and $bottom) { $full } elseif ($top) { $upper } elseif ($bottom) { $lower } else { ' ' }
      })
    Write-Host $line -ForegroundColor White -BackgroundColor Black
  }
}

# Writes spaces over the lines from $Top to the cursor, and puts the cursor back at $Top. A console that does not
# give the position of the cursor keeps the lines.
function Hide-Lines($Top) {
  try {
    $raw = $Host.UI.RawUI
    $end = $raw.CursorPosition.Y
    $raw.CursorPosition = $Top
    for ($y = $Top.Y; $y -lt $end; $y++) { Write-Host (' ' * ($raw.BufferSize.Width - 1)) }
    $raw.CursorPosition = $Top
  } catch {}
}

switch ($Command) {
  'open' {
    Open-Window
  }
  'call' {
    try {
      $reply = Get-Bridge '/call' 'Post'
    } catch {
      Show-Note 'The bridge does not run. Run: yonder restart'
      exit 1
    }
    # No window heard the key: open one, wait until it listens, and send the key again.
    if ($reply.windows -eq 0) {
      Open-Window
      for ($i = 0; $i -lt 50 -and (Get-Windows) -eq 0; $i++) { Start-Sleep -Milliseconds 200 }
      # The window loads the account and the projects before a call can start.
      Start-Sleep 1
      $null = Get-Bridge '/call' 'Post'
    }
  }
  'pair' {
    # A new install waits a moment for the bridge.
    for ($i = 0; $i -lt 30; $i++) {
      try { $null = Get-Bridge '/relay'; break } catch { Start-Sleep -Milliseconds 500 }
    }
    $asked = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    try {
      $reply = Get-Bridge '/relay' 'Post'
    } catch {
      $message = if ($_.ErrorDetails.Message) { ($_.ErrorDetails.Message | ConvertFrom-Json).error } else { 'The Yonder bridge does not run. Run: yonder restart' }
      Write-Host $message -ForegroundColor Red
      exit 1
    }
    $top = $(try { $Host.UI.RawUI.CursorPosition } catch {})
    Write-Host 'Scan this code with the Yonder app on the phone. It works one time, for 5 minutes.'
    Show-Qr $reply.qr
    while ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $reply.expires) {
      $phone = (Get-Bridge '/relay').phones | Where-Object { $_.added -ge $asked } | Select-Object -First 1
      if ($phone) {
        Hide-Lines $top
        Write-Host "Paired with $($phone.name)."
        exit 0
      }
      Start-Sleep 1
    }
    Write-Host 'The code ran out. Run yonder pair again.' -ForegroundColor Red
    exit 1
  }
  'update' {
    Invoke-RestMethod -UseBasicParsing 'https://download.yonder.so/install.ps1' | Invoke-Expression
  }
  'restart' {
    Stop-Yonder
    Start-Yonder
  }
  'stop' {
    Stop-Yonder
  }
  'serve' {
    # The loop does the work of the service on Linux: Restart=always, and the output of the bridge goes to bridge.log.
    # cmd writes the bytes of the bridge to the file as they are. The bridge finds dist\ through YONDER_ROOT.
    New-Item -ItemType Directory -Force $Config | Out-Null
    $env:YONDER_ROOT = $Data
    $env:YONDER_EXE = Join-Path $Data 'yonder-bridge.exe'
    $env:YONDER_LOG = $Log
    while ($true) {
      cmd --% /c ""%YONDER_EXE%" >> "%YONDER_LOG%" 2>&1"
      Start-Sleep 2
    }
  }
  'logs' {
    Get-Content $Log -Tail 50 -Wait -Encoding UTF8
  }
  'uninstall' {
    # The opposite of windows/install.ps1. The workers of Claude Code keep running.
    Stop-Yonder
    $programs = [Environment]::GetFolderPath('Programs')
    Remove-Item -Force -ErrorAction SilentlyContinue "$programs\Yonder.lnk", "$programs\Yonder Call.lnk",
      "$([Environment]::GetFolderPath('Startup'))\Yonder.lnk"
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $path = $key.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
    $key.SetValue('Path', (($path -split ';') | Where-Object { $_ -and $_ -ne "$Data\bin" }) -join ';', 'ExpandString')
    Remove-Item -Recurse -Force $Data
    Write-Host 'Yonder is removed. Its settings and pairings stay in ~\.config\yonder.'
  }
  default {
    Get-Content $PSCommandPath | Select-Object -Skip 2 -First 7 | ForEach-Object { $_ -replace '^# ', '' }
  }
}
