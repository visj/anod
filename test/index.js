import path from "path";
import * as fs from "fs/promises";
import { report } from "./helper/index.js";
import * as anod from "../build/index.js";
import * as core from "../dist/index.js";
import * as array from "../dist/array.js";

const __dirname = import.meta.dirname;
const TEST_FOLDER = path.join(__dirname, "tests");

var anodmin = Object.assign({}, core, array);

async function load(modulePath) {
    return await import(modulePath);
}

(async function() {
    const files = await fs.readdir(TEST_FOLDER);
    const tests = await Promise.all(files.map(file => load(path.join(TEST_FOLDER, file))));
    console.log("-- Testing bundled version --");
    for (const test of tests) {
        test.run(anod);
    }
    report();
    console.log("-- Testing minified version --");
    for (const test of tests) {
        test.run(anodmin);
    }
    report();
})();