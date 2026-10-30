// Writes the default product sheet template to sheet-template/CatalogLink_Template.xlsx.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildTemplate } from "../src/sync/template";

const out = resolve(import.meta.dirname, "../../../sheet-template/CatalogLink_Template.xlsx");
await writeFile(out, await buildTemplate());
console.log(`Wrote ${out}`);
