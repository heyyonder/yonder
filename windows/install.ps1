# Installs Yonder on Windows (docs/wiki/windows.md):  irm https://download.yonder.so/install.ps1 | iex
#
# It puts the bridge, the window (dist\) and the yonder command in %LOCALAPPDATA%\Yonder, and the command on the PATH
# of the user. It adds Yonder and Yonder Call to the Start menu, with the key Ctrl + Alt + Y on Yonder Call, and Yonder
# to the Startup folder, so that the bridge starts at each log-in. Then it shows the QR code that pairs the phone. Run
# it again to update: the settings and the pairings in ~\.config\yonder stay.
# $env:YONDER_ZIP = <file> installs from a local file, for a test. The bridge runs it each time that a new version comes
# out ($env:YONDER_VERSION, the update of the bridge in bridge/main.ts). That run gets the zip of that version and shows
# no QR code.
# `irm | iex` runs this in the PowerShell of the user, so it stops with throw, never with exit, and it keeps its
# variables in a script block. The file is ASCII.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  # Windows on Arm runs the x64 build through its emulation.
  if ($env:PROCESSOR_ARCHITECTURE -notin 'AMD64', 'ARM64') { throw "Yonder has no build for $env:PROCESSOR_ARCHITECTURE." }
  $Data = Join-Path $env:LOCALAPPDATA 'Yonder'
  $PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  # The scripts run in a new PowerShell with Bypass, because the default policy of Windows runs no script file.
  $yonder = { & $PowerShell -NoProfile -ExecutionPolicy Bypass -File "$Data\yonder.ps1" @args }
  # The download goes next to the install, so that the move stays on one drive.
  $tmp = "$Data.download"
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Write-Host 'Downloading Yonder...'
    $zip = Join-Path $tmp 'yonder.zip'
    if ($env:YONDER_ZIP) {
      Copy-Item $env:YONDER_ZIP $zip
    } else {
      # The zip of a version has its own name, so the cache of Cloudflare never gives an older one.
      $name = if ($env:YONDER_VERSION) { "yonder-windows-x64-$env:YONDER_VERSION.zip" } else { 'yonder-windows-x64.zip' }
      Invoke-WebRequest -UseBasicParsing "https://download.yonder.so/$name" -OutFile $zip
    }
    Expand-Archive $zip $tmp -Force
    if (-not (Test-Path "$tmp\yonder\yonder-bridge.exe")) { throw 'The download has no bridge.' }

    # Windows cannot replace a program that runs, so the bridge stops first. The workers of Claude Code keep running.
    Write-Host 'Starting the bridge...'
    & $PowerShell -NoProfile -ExecutionPolicy Bypass -File "$tmp\yonder\yonder.ps1" stop
    # The new version takes the place of the old one in one step.
    Remove-Item -Recurse -Force "$Data.old" -ErrorAction SilentlyContinue
    if (Test-Path $Data) { Move-Item $Data "$Data.old" }
    Move-Item "$tmp\yonder" $Data
    Remove-Item -Recurse -Force "$Data.old" -ErrorAction SilentlyContinue
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  # The yonder command: bin\yonder.cmd on the PATH of the user. The value keeps names such as %USERPROFILE%.
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  $path = $key.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
  if (($path -split ';') -notcontains "$Data\bin") {
    $key.SetValue('Path', ((@($path -split ';') + "$Data\bin") | Where-Object { $_ }) -join ';', 'ExpandString')
    # A change through .NET tells the open apps that the environment changed, so a new terminal gets the new PATH.
    [Environment]::SetEnvironmentVariable('YONDER_INSTALL', '1', 'User')
    [Environment]::SetEnvironmentVariable('YONDER_INSTALL', $null, 'User')
  }

  # The shortcuts run the command with no console window. A shortcut in the Start menu can have a key of its own.
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = {
    param($File, $Command, $Key)
    $link = $shell.CreateShortcut($File)
    $link.TargetPath = $PowerShell
    $link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Data\yonder.ps1`" $Command"
    $link.IconLocation = "$Data\yonder.ico"
    $link.WindowStyle = 7
    if ($Key) { $link.Hotkey = $Key }
    $link.Save()
  }
  $programs = [Environment]::GetFolderPath('Programs')
  & $shortcut "$programs\Yonder.lnk" open
  & $shortcut "$programs\Yonder Call.lnk" call 'Ctrl+Alt+Y'
  & $shortcut "$([Environment]::GetFolderPath('Startup'))\Yonder.lnk" serve
  & $yonder restart

  if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and -not (Test-Path "$HOME\.local\bin\claude.exe")) {
    Write-Host 'Yonder runs Claude Code. Install it with: irm https://claude.ai/install.ps1 | iex'
  }
  Write-Host ''
  Write-Host 'Yonder is installed. Ctrl + Alt + Y starts and ends a call. Open the window with Yonder in the Start menu.'
  if ($env:YONDER_VERSION) { return }
  Write-Host ''
  & $yonder pair
  if ($LASTEXITCODE) { Write-Host 'Pair a phone later with: yonder pair' }
}
