@rem The yonder command for cmd and PowerShell (windows/yonder.ps1). (goto) ends the batch file first, so cmd does not
@rem read this file again after `yonder uninstall` deletes it, and the exit code of PowerShell comes through.
@(goto) 2>nul & powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\yonder.ps1" %*
