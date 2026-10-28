# L'appli au premier plan et la position de sa fenêtre (Windows), en pixels physiques.
#   powershell -File win-front.ps1 → JSON { app, bundle, pid, title, bounds: { x, y, width, height } }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class GilbertWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[GilbertWin]::SetProcessDPIAware() | Out-Null
$h = [GilbertWin]::GetForegroundWindow()
$r = New-Object GilbertWin+RECT
[GilbertWin]::GetWindowRect($h, [ref]$r) | Out-Null
$procId = [uint32]0
[GilbertWin]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$sb = New-Object System.Text.StringBuilder 512
[GilbertWin]::GetWindowText($h, $sb, 512) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
$name = if ($proc) { $proc.ProcessName } else { '' }
@{
  app = $name; bundle = $name; pid = [int]$procId; title = $sb.ToString()
  bounds = @{ x = $r.Left; y = $r.Top; width = $r.Right - $r.Left; height = $r.Bottom - $r.Top }
} | ConvertTo-Json -Compress
