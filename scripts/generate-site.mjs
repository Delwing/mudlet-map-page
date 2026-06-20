// Build a static map-browser site from a Mudlet binary map (.dat).
//
// Run by the composite action (action.yml). Inputs arrive as INPUT_* env vars.
// Two outputs:
//   1. <output>/data/mapExport.json + colors.json — the .dat decoded offline, so
//      visitors load plain JSON (no in-browser binary decode).
//   2. <output>/index.html — the host shell with MAP_CONFIG + CDN <script>/<link>.
//
// Path-valued inputs (logo, npc-url, favicon) and the `assets` list may reference
// files that already live in the caller's repo: a local path is copied into the
// site at the same relative path and referenced there; a URL is used verbatim.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, cpSync} from "node:fs";
import {resolve, join, dirname} from "node:path";
import {MudletMapReader} from "mudlet-map-binary-reader";

const input = (name, def = "") => {
    const v = process.env[`INPUT_${name}`];
    return v === undefined || v === "" ? def : v;
};

const mapFile = input("MAP_FILE");
if (!mapFile) throw new Error("map-file input is required");

const outputDir = input("OUTPUT_DIR", "_site");
const version = input("VERSION", "1");
const lang = input("LANG", "en");
const theme = input("THEME", "dark");
const title = input("TITLE");
const logo = input("LOGO");
const npc = input("NPC_URL");
const favicon = input("FAVICON");
const assets = input("ASSETS");
const creditsAuthor = input("CREDITS_AUTHOR");
const creditsGithubUrl = input("CREDITS_GITHUB_URL");
const creditsRemark = input("CREDITS_REMARK");
const extraConfig = input("EXTRA_CONFIG");

const URL_RE = /^(https?:)?\/\//i;
const isUrl = (s) => URL_RE.test(s) || s.startsWith("data:");

// Copy a checkout-relative file/dir into the site at the SAME relative path, so a
// MAP_CONFIG value like "images/logo.png" resolves once the site is deployed.
function copyIntoSite(relPath) {
    const dest = join(outputDir, relPath);
    mkdirSync(dirname(dest), {recursive: true});
    cpSync(resolve(relPath), dest, {recursive: true});
}

// A config value that is either a URL (used verbatim) or a repo-local path
// (copied into the site, referenced by the same relative path).
function asset(value) {
    if (!value) return undefined;
    if (isUrl(value)) return value;
    if (existsSync(resolve(value))) copyIntoSite(value);
    else console.warn(`mudlet-map-page: "${value}" is not a URL and was not found in the checkout — referenced as-is.`);
    return value;
}

// --- 1. Decode .dat → the two JSON arrays the bundle loads via mapDataUrl + colorsUrl.
// MudletMapReader.export() returns exactly { mapData, colors }.
const dataDir = join(outputDir, "data");
mkdirSync(dataDir, {recursive: true});
const bytes = new Uint8Array(readFileSync(resolve(mapFile)));
const {mapData, colors} = MudletMapReader.export(MudletMapReader.readBuffer(bytes));
writeFileSync(join(dataDir, "mapExport.json"), JSON.stringify(mapData));
writeFileSync(join(dataDir, "colors.json"), JSON.stringify(colors));

// --- 2. Assemble MAP_CONFIG from the inputs (only set what was provided).
const config = {mapDataUrl: "data/mapExport.json", colorsUrl: "data/colors.json"};
if (title) config.title = title;
if (logo) config.logo = asset(logo);
if (npc) config.npcUrl = asset(npc);
const credits = {};
if (creditsAuthor) credits.author = creditsAuthor;
if (creditsGithubUrl) credits.githubUrl = creditsGithubUrl;
if (creditsRemark) credits.remark = creditsRemark;
if (Object.keys(credits).length) config.credits = credits;
if (extraConfig) Object.assign(config, JSON.parse(extraConfig)); // escape hatch: translations, languages, …

// Copy any extra repo files referenced elsewhere (e.g. via extra-config or NPC tooltips).
for (const a of assets.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)) {
    if (existsSync(resolve(a))) copyIntoSite(a);
    else console.warn(`mudlet-map-page: asset not found, skipped: ${a}`);
}

// favicon: a local file is copied to /favicon.ico; a URL is linked directly.
let faviconHref;
if (favicon) {
    if (isUrl(favicon)) faviconHref = favicon;
    else if (existsSync(resolve(favicon))) {
        copyFileSync(resolve(favicon), join(outputDir, "favicon.ico"));
        faviconHref = "favicon.ico";
    } else faviconHref = favicon;
}

// --- 3. Render the host shell. CDN URLs carry the version range straight to jsDelivr.
const base = `https://cdn.jsdelivr.net/npm/mudlet-map-browser-script@${version}/dist`;
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
// `</script>` inside the inlined JSON would close the tag early — neutralise `<`.
const configJson = JSON.stringify(config, null, 4).replace(/</g, "\\u003c");

const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" data-bs-theme="${escapeHtml(theme)}">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <title>${escapeHtml(title || "Map")}</title>
        <link rel="stylesheet" href="${base}/index.min.css" />${faviconHref ? `\n        <link rel="shortcut icon" type="image/x-icon" href="${escapeHtml(faviconHref)}" />` : ""}
        <style>
            #root {
                display: contents;
            }
        </style>
    </head>
    <body>
        <div id="root"></div>
        <script>
            window.MAP_CONFIG = ${configJson};
        </script>
        <script src="${base}/index.min.js"></script>
    </body>
</html>
`;
writeFileSync(join(outputDir, "index.html"), html);

console.log(`Generated ${outputDir}/ from ${mapFile} (bundle @${version}).`);
