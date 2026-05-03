import fs from "node:fs";

const [version] = process.argv.slice(2).filter((argument) => argument !== "--");
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/;

if (!version || !semver.test(version)) {
  console.error("Usage: pnpm version:set -- <semver>");
  process.exit(1);
}

updateJson("package.json", (json) => {
  json.version = version;
  return json;
});

updateJson("src-tauri/tauri.conf.json", (json) => {
  json.version = version;
  return json;
});

replaceInFile(
  "src-tauri/Cargo.toml",
  /^version = "[^"]+"/m,
  `version = "${version}"`,
);

if (fs.existsSync("src-tauri/Cargo.lock")) {
  replaceInFile(
    "src-tauri/Cargo.lock",
    /(\[\[package\]\]\nname = "waymark"\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );
}

console.log(`Waymark version set to ${version}.`);

function updateJson(path, update) {
  const json = JSON.parse(fs.readFileSync(path, "utf8"));
  fs.writeFileSync(path, `${JSON.stringify(update(json), null, 2)}\n`);
}

function replaceInFile(path, pattern, replacement) {
  const source = fs.readFileSync(path, "utf8");

  if (!pattern.test(source)) {
    console.error(`Could not update ${path}; expected version pattern was not found.`);
    process.exit(1);
  }

  const next = source.replace(pattern, replacement);
  fs.writeFileSync(path, next);
}
