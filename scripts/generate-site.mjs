// Build a static map-browser site from a Mudlet binary map (.dat).
//
// Run by the composite action (action.yml). Inputs arrive as INPUT_* env vars.
// Two outputs:
//   1. <output>/data/mapExport.json + colors.json — the .dat decoded offline, so
//      visitors load plain JSON (no in-browser binary decode).
//   2. <output>/index.html — the host shell with MAP_CONFIG + CDN <script>/<link>.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync} from "node:fs";
import {resolve, join} from "node:path";
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
const favicon = input("FAVICON");
const creditsAuthor = input("CREDITS_AUTHOR");
const creditsGithubUrl = input("CREDITS_GITHUB_URL");
const creditsRemark = input("CREDITS_REMARK");
const extraConfig = input("EXTRA_CONFIG");

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
if (logo) config.logo = logo;
const credits = {};
if (creditsAuthor) credits.author = creditsAuthor;
if (creditsGithubUrl) credits.githubUrl = creditsGithubUrl;
if (creditsRemark) credits.remark = creditsRemark;
if (Object.keys(credits).length) config.credits = credits;
if (extraConfig) Object.assign(config, JSON.parse(extraConfig)); // escape hatch: translations, languages, …

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
        <link rel="stylesheet" href="${base}/index.min.css" />${favicon ? '\n        <link rel="shortcut icon" type="image/x-icon" href="favicon.ico" />' : ""}
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
if (favicon && existsSync(favicon)) copyFileSync(favicon, join(outputDir, "favicon.ico"));

console.log(`Generated ${outputDir}/ from ${mapFile} (bundle @${version}).`);
