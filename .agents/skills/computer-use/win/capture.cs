// capture.cs - P/Invoke + screen capture (compiled via Add-Type -Path)
// Conservative C# (CodeDom-compatible: no modern syntax).
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class WinCapture
{
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private static ImageCodecInfo JpegCodec()
    {
        foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders())
            if (c.MimeType == "image/jpeg") return c;
        return null;
    }

    public static string CaptureRect(int x, int y, int w, int h, string outPath, int quality, int fmt)
    {
        if (w <= 0 || h <= 0) return "ERR_BOUNDS";
        try
        {
            using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(x, y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
                }
                string dir = System.IO.Path.GetDirectoryName(outPath);
                if (!String.IsNullOrEmpty(dir)) System.IO.Directory.CreateDirectory(dir);
                if (fmt == 1) { bmp.Save(outPath, ImageFormat.Png); }
                else
                {
                    EncoderParameters ep = new EncoderParameters(1);
                    ep.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
                    bmp.Save(outPath, JpegCodec(), ep);
                }
            }
            return "OK";
        }
        catch (Exception ex) { return "ERR:" + ex.Message; }
    }

    public static string CaptureWindow(IntPtr hwnd, string outPath, int quality, int fmt)
    {
        RECT r;
        if (!GetWindowRect(hwnd, out r)) return "ERR_NORECT";
        return CaptureRect(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, outPath, quality, fmt);
    }

    public static string CaptureFull(string outPath, int quality, int fmt)
    {
        int x = GetSystemMetrics(76), y = GetSystemMetrics(77);
        int w = GetSystemMetrics(78), h = GetSystemMetrics(79);
        return CaptureRect(x, y, w, h, outPath, quality, fmt);
    }
}

