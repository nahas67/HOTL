import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src");
const output = resolve(root, "dist");

if (dirname(output) !== root || output === root) {
  throw new Error("Refusing to build outside the Site project.");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true, errorOnExist: true, force: false });
console.log(`Built static Site assets at ${output}`);
