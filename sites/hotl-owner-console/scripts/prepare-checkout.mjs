import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkout = resolve(sourceRoot, ".sites-checkout");
const repositoryRoot = resolve(sourceRoot, "..", "..");
const inTree = relative(sourceRoot, checkout);
if (!inTree || inTree.startsWith(`..${sep}`) || inTree === "..") throw new Error("Checkout path escaped the Site source directory.");
const checkoutStat = existsSync(checkout) ? lstatSync(checkout) : null;
if (checkoutStat?.isSymbolicLink() || checkoutStat && !checkoutStat.isDirectory()) throw new Error("The Site checkout path must be a normal directory.");

if (existsSync(join(checkout, ".git"))) {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: checkout, encoding: "utf8" }).trim();
  if (dirty) throw new Error("The Site checkout has local changes; preserve or save them before syncing the reviewed source.");
}

const appManifest = JSON.parse(await (await import("node:fs/promises")).readFile(join(sourceRoot, ".openai", "hosting.json"), "utf8"));
const repositoryManifest = JSON.parse(await (await import("node:fs/promises")).readFile(join(repositoryRoot, ".openai", "hosting.json"), "utf8"));
if (typeof repositoryManifest.project_id !== "string" || repositoryManifest.project_id.length < 1) throw new Error("Register the Site before preparing its publish checkout.");
if (appManifest.project_id !== repositoryManifest.project_id) throw new Error("The Site application and repository manifests identify different projects.");

mkdirSync(checkout, { recursive: true });
for (const entry of [".openai", ".gitignore", "package.json", "src", "scripts", "tests"]) {
  const from = join(sourceRoot, entry);
  if (!existsSync(from)) continue;
  cpSync(from, join(checkout, entry), { recursive: true, force: true, dereference: false });
}
for (const name of readdirSync(checkout)) {
  if ([".git", ".sites-checkout"].includes(name)) continue;
  if (![".openai", ".gitignore", "package.json", "src", "scripts", "tests", "dist"].includes(name)) {
    throw new Error(`Unexpected file in isolated Site checkout: ${name}`);
  }
}
console.log(`Prepared the isolated Site source checkout at ${checkout}`);
