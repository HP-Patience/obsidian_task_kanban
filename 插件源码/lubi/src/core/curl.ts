type CurlOptions = { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; maxTime?: number };

/** 桌面端网络兜底：某些自签名/非标准端口服务可被 curl 访问，但会被 Electron 关闭连接。 */
export function curlJson(url: string, options: CurlOptions = {}): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    try {
      const nodeRequire = (0, eval)("require") as (name: string) => { spawn: (command: string, args: string[], options: Record<string, unknown>) => { stdout: AsyncIterable<Uint8Array>; stderr: AsyncIterable<Uint8Array>; on: (event: string, cb: (...args: unknown[]) => void) => void } };
      const { spawn } = nodeRequire("node:child_process");
      const command = /win/i.test(navigator.userAgent) ? "curl.exe" : "curl";
      const args = ["--silent", "--show-error", "--insecure", "--max-time", String(options.maxTime ?? 45), "--write-out", "\n__LUBI_STATUS__:%{http_code}", "--request", options.method || "GET"];
      for (const [key, value] of Object.entries(options.headers || {})) args.push("--header", `${key}: ${value}`);
      if (options.body !== undefined) args.push("--data-binary", options.body);
      args.push(url);
      const child = spawn(command, args, { windowsHide: true, shell: false });
      let out = "";
      let err = "";
      void (async () => { for await (const chunk of child.stdout) out += new TextDecoder().decode(chunk); })();
      void (async () => { for await (const chunk of child.stderr) err += new TextDecoder().decode(chunk); })();
      child.on("error", (e) => reject(new Error(`无法启动 curl：${String(e)}`)));
      child.on("close", (code) => {
        const marker = out.lastIndexOf("\n__LUBI_STATUS__:");
        const status = marker >= 0 ? Number(out.slice(marker + 17).trim()) : 0;
        const text = marker >= 0 ? out.slice(0, marker) : out;
        if (code !== 0 || !status) { reject(new Error(err.trim() || `curl 退出码 ${code ?? "未知"}`)); return; }
        try { resolve({ status, json: JSON.parse(text) }); } catch { reject(new Error("curl 返回的不是 JSON")); }
      });
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
  });
}
