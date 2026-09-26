// input.cs - foreground + mouse click (P/Invoke)
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class WinInput
{
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    // rect-window local (imgX,imgY) -> screen click
    public static string Click(IntPtr hwnd, int imgX, int imgY)
    {
        RECT r;
        if (!GetWindowRect(hwnd, out r)) return "ERR_NORECT";
        SetForegroundWindow(hwnd);
        Thread.Sleep(250);
        int sx = r.Left + imgX;
        int sy = r.Top + imgY;
        SetCursorPos(sx, sy);
        Thread.Sleep(80);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
        return "OK";
    }
}

