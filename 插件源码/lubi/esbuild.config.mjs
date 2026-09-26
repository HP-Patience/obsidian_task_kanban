import esbuild from "esbuild";
import process from "process";
import fs from "fs";

const prod = process.argv[2] === "production";
const outdir = process.env.LUBI_OUT || ".";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: `${outdir}/main.js`,
  minify: false,
});

if (prod) {
  await ctx.rebuild();
  for (const f of ["manifest.json", "styles.css"]) if (outdir !== ".") fs.copyFileSync(f, `${outdir}/${f}`);
  process.exit(0);
} else {
  await ctx.watch();
}
