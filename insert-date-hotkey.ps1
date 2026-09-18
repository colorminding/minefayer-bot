$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
}
"@

$hotkeyId = 1
$vkInsert = 0x2D
$wmHotkey = 0x0312

$registered = [NativeMethods]::RegisterHotKey([IntPtr]::Zero, $hotkeyId, 0, $vkInsert)
if (-not $registered) {
    throw "Could not register the Insert hotkey. Another application may already be using it."
}

$wshell = New-Object -ComObject WScript.Shell

Write-Host "Running. Press Insert to type today's date as DD.MM.YYYY."
Write-Host "Close this window to stop the script."

try {
    while ($true) {
        $msg = New-Object NativeMethods+MSG
        $result = [NativeMethods]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)
        if ($result -eq -1) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "GetMessage failed with Win32 error code $errorCode."
        }
        if ($result -eq 0) { break }

        if ($msg.message -eq $wmHotkey -and $msg.wParam.ToUInt32() -eq $hotkeyId) {
            $today = (Get-Date).ToString('dd.MM.yyyy')
            Set-Clipboard -Value $today
            $wshell.SendKeys('^v')
        }
    }
}
finally {
    [void][NativeMethods]::UnregisterHotKey([IntPtr]::Zero, $hotkeyId)
}
