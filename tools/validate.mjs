import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

async function fileExists(relativePath, context = relativePath) {
  const absolutePath = normalize(join(root, relativePath));
  if (!absolutePath.startsWith(root)) {
    errors.push(`${context}: path escapes the module root`);
    return;
  }

  try {
    await access(absolutePath);
  } catch {
    errors.push(`${context}: referenced file does not exist (${relativePath})`);
  }
}

async function findJavaScriptFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(relativePath));
    } else if (entry.isFile() && [".js", ".mjs"].some((extension) => entry.name.endsWith(extension))) {
      files.push(relativePath);
    }
  }

  return files;
}

async function validateRelativeImports(modulePath) {
  const source = await readFile(join(root, modulePath), "utf8");
  const imports = [...source.matchAll(/from\s+["'](.+?)["']/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("."));

  await Promise.all(imports.map((path) => {
    const target = relative(root, resolve(root, dirname(modulePath), path));
    return fileExists(target, modulePath);
  }));
}

const manifest = await readJson("module.json");
const de = await readJson("lang/de.json");
const en = await readJson("lang/en.json");

if (manifest) {
  const expected = {
    id: "gm-combat-workspace",
    title: "GM Combat Workspace"
  };

  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      errors.push(`module.json: ${key} must equal ${JSON.stringify(value)}`);
    }
  }

  if (!/^0\.\d+\.\d+$/.test(manifest.version ?? "")) {
    errors.push("module.json: version must use semantic 0.x.y format during development");
  }

  if (Number(manifest.compatibility?.minimum) !== 14) {
    errors.push("module.json: Foundry minimum compatibility must be 14");
  }

  const dnd5e = manifest.relationships?.systems?.find(({ id }) => id === "dnd5e");
  if (!dnd5e || Number.parseFloat(dnd5e.compatibility?.minimum) < 5.3) {
    errors.push("module.json: D&D5e 5.3+ system relationship is required");
  }

  if ((manifest.relationships?.requires ?? []).some(({ type }) => type === "module")) {
    errors.push("module.json: third-party modules must not be hard requirements");
  }

  const referencedFiles = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(({ path }) => path),
    manifest.license,
    manifest.readme
  ].filter(Boolean);

  await Promise.all(referencedFiles.map((path) => fileExists(path, "module.json")));

  const javaScriptFiles = await findJavaScriptFiles("scripts");
  await Promise.all(javaScriptFiles.map(validateRelativeImports));
}

if (de && en) {
  const deKeys = Object.keys(de).sort();
  const enKeys = Object.keys(en).sort();
  const missingInEnglish = deKeys.filter((key) => !enKeys.includes(key));
  const missingInGerman = enKeys.filter((key) => !deKeys.includes(key));

  for (const key of missingInEnglish) errors.push(`lang/en.json: missing key ${key}`);
  for (const key of missingInGerman) errors.push(`lang/de.json: missing key ${key}`);
}

if (errors.length) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Validation passed.");
}
