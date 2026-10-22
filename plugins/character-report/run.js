const { spawn } = require("child_process");
const path = require("path");

const plugin = path.join(__dirname, "main.js");
const electron = path.join(__dirname, "..", "..", "wrap2exe", "node_modules", "electron", "dist", "electron.exe");
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [plugin].concat(process.argv.slice(2)), {
  cwd: path.join(__dirname, "..", ".."),
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code) => {
  process.exit(code == null ? 1 : code);
});
