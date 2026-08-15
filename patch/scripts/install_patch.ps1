$log = "D:\新项目\优化opencode\patch\install.log"
try {
  $appDir = "C:\Users\Administrator\AppData\Local\Programs\@opencode-aidesktop\OpenCode.exe"
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $appDir } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
  $src = "D:\新项目\优化opencode\app.asar.new"
  $dst = "C:\Users\Administrator\AppData\Local\Programs\@opencode-aidesktop\resources\app.asar"
  Copy-Item -LiteralPath $src -Destination $dst -Force
  $newLen = (Get-Item -LiteralPath $dst).Length
  Set-Content -LiteralPath $log -Value "OK $newLen" -Encoding UTF8
} catch {
  Set-Content -LiteralPath $log -Value "FAIL $($_.Exception.Message)" -Encoding UTF8
}
