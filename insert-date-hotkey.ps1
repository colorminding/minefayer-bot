$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods
{
    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const uint PM_REMOVE = 0x0001;

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

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);

    [DllImport("user32.dll")]
    public static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    public static extern IntPtr DispatchMessage(ref MSG lpMsg);
}
"@

$hotkeyId = 1
$vkInsert = 0x2D
$wmHotkey = 0x0312
$wmQuit = 0x0012
$repeatSuppressMs = 250
$lastHotkeyAt = [DateTime]::MinValue

$registered = [NativeMethods]::RegisterHotKey([IntPtr]::Zero, $hotkeyId, 0, $vkInsert)
if (-not $registered) {
    throw "Could not register the Insert hotkey. Another application may already be using it."
}

function Send-LiteralText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $inputSize = [Runtime.InteropServices.Marshal]::SizeOf([type]'NativeMethods+INPUT')

    foreach ($char in $Text.ToCharArray()) {
        $downKey = New-Object NativeMethods+KEYBDINPUT
        $downKey.wVk = 0
        $downKey.wScan = [uint16][int]$char
        $downKey.dwFlags = [NativeMethods]::KEYEVENTF_UNICODE
        $downKey.time = 0
        $downKey.dwExtraInfo = [IntPtr]::Zero

        $downUnion = New-Object NativeMethods+InputUnion
        $downUnion.ki = $downKey

        $downInput = New-Object NativeMethods+INPUT
        $downInput.type = [NativeMethods]::INPUT_KEYBOARD
        $downInput.U = $downUnion

        $upKey = New-Object NativeMethods+KEYBDINPUT
        $upKey.wVk = 0
        $upKey.wScan = [uint16][int]$char
        $upKey.dwFlags = [NativeMethods]::KEYEVENTF_UNICODE -bor [NativeMethods]::KEYEVENTF_KEYUP
        $upKey.time = 0
        $upKey.dwExtraInfo = [IntPtr]::Zero

        $upUnion = New-Object NativeMethods+InputUnion
        $upUnion.ki = $upKey

        $upInput = New-Object NativeMethods+INPUT
        $upInput.type = [NativeMethods]::INPUT_KEYBOARD
        $upInput.U = $upUnion

        $sent = [NativeMethods]::SendInput(2, @($downInput, $upInput), $inputSize)
        if ($sent -ne 2) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "SendInput failed with Win32 error code $errorCode."
        }
    }
}

Write-Host "Running. Press Insert to insert today's date as dd.MM.yyyy."
Write-Host "Close this window to stop the script."

try {
    $insertDownProcessed = $false
    $shouldExit = $false

    while ($true) {
        $insertKeyDown = (([NativeMethods]::GetAsyncKeyState($vkInsert) -band 0x8000) -ne 0)
        if (-not $insertKeyDown) {
            $insertDownProcessed = $false
        }

        while ($true) {
            $msg = New-Object NativeMethods+MSG
            $hasMessage = [NativeMethods]::PeekMessage([ref]$msg, [IntPtr]::Zero, 0, 0, [NativeMethods]::PM_REMOVE)
            if (-not $hasMessage) { break }

            $insertKeyDown = (([NativeMethods]::GetAsyncKeyState($vkInsert) -band 0x8000) -ne 0)
            if (-not $insertKeyDown) {
                $insertDownProcessed = $false
            }

            if ($msg.message -eq $wmQuit) {
                $shouldExit = $true
                break
            }

            if ($msg.message -eq $wmHotkey -and ([int64]$msg.wParam) -eq $hotkeyId) {
                if ($insertDownProcessed) {
                    continue
                }

                $now = Get-Date
                if (($now - $lastHotkeyAt).TotalMilliseconds -lt $repeatSuppressMs) {
                    continue
                }

                $insertDownProcessed = $true
                $lastHotkeyAt = $now

                $today = (Get-Date).ToString('dd.MM.yyyy')
                Send-LiteralText -Text $today
            }

            [void][NativeMethods]::TranslateMessage([ref]$msg)
            [void][NativeMethods]::DispatchMessage([ref]$msg)
        }

        if ($shouldExit) { break }
        Start-Sleep -Milliseconds 10
    }
}
finally {
    [void][NativeMethods]::UnregisterHotKey([IntPtr]::Zero, $hotkeyId)
}
