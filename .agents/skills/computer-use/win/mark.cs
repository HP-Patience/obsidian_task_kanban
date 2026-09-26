// mark.cs - draw confirmation markers (crosshair + ring + index) onto a screenshot copy
//   Marker coordinates = same pixel space as the source PNG (== act-bg click space).
//   Source file is never modified; result written to a new file.
//   Dual-color (white halo + red core) so markers stay visible on any background.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class WinMark
{
    // pts = "x:y[,x:y...]" ; size = half-extent of crosshair arms in px ; returns JSON
    public static string Mark(string inPath, string outPath, string pts, int size, string label)
    {
        try
        {
            using (Bitmap bmp = new Bitmap(inPath))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    string[] items = pts.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                    int idx = 0;
                    foreach (string it in items)
                    {
                        string[] xy = it.Split(':');
                        int x = int.Parse(xy[0]);
                        int y = int.Parse(xy[1]);
                        idx++;
                        // white halo layer (bigger ring/arms), then red core layer on top
                        DrawMarker(g, x, y, size + 4, Color.White, 7);
                        DrawMarker(g, x, y, size, Color.FromArgb(255, 32, 32), 3);
                        // index label (dark outline + white fill) at top-right of ring
                        if (items.Length > 1 && idx <= 99)
                        {
                            string s = idx.ToString();
                            using (Font f = new Font("Arial", 11, FontStyle.Bold))
                            {
                                SizeF ts = g.MeasureString(s, f);
                                float lx = x + size * 0.62f;
                                float ly = y - size * 0.62f - ts.Height;
                                using (SolidBrush db = new SolidBrush(Color.FromArgb(220, 0, 0, 0)))
                                using (SolidBrush wb = new SolidBrush(Color.White))
                                {
                                    g.DrawString(s, f, db, lx + 1, ly + 1);
                                    g.DrawString(s, f, wb, lx, ly);
                                }
                            }
                        }
                    }
                }
                if (string.Equals(inPath, outPath, StringComparison.OrdinalIgnoreCase))
                    return "ERR_SAME_FILE";   // never clobber the source
                string dir = System.IO.Path.GetDirectoryName(outPath);
                if (!String.IsNullOrEmpty(dir)) System.IO.Directory.CreateDirectory(dir);
                bmp.Save(outPath, ImageFormat.Png);
            }
            return "{\"in\":\"" + inPath + "\",\"out\":\"" + outPath + "\",\"pts\":\"" + pts + "\",\"ok\":true}";
        }
        catch (Exception ex)
        {
            return "ERR " + ex.Message;
        }
    }

    private static void DrawMarker(Graphics g, int x, int y, int size, Color c, int penW)
    {
        using (Pen p = new Pen(c, penW))
        {
            // ring
            g.DrawEllipse(p, x - size / 2, y - size / 2, size, size);
            // crosshair arms
            g.DrawLine(p, x - size, y, x + size, y);
            g.DrawLine(p, x, y - size, x, y + size);
            // center dot
            g.DrawEllipse(p, x - 1.5f, y - 1.5f, 3, 3);
        }
    }
}
