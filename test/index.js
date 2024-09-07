import path from "path";
import * as fs from "fs/promises";
import { report, Anod } from "./helper/index.js";
import * as anod from "../build/index.js";
import * as core from "../dist/index.js";
import * as array from "../dist/array.js";

const __dirname = import.meta.dirname;
const TEST_FOLDER = path.join(__dirname, "tests");

var anodmin = Object.assign({}, core, array);

/**
 * 
 * @param {string} test 
 */
async function asserts(tests) {
    let count = 0;
    for (const test of tests) {
        const file = (await fs.readFile(path.join(TEST_FOLDER, test))).toString();
        let index = 0;
        while ((index = file.indexOf("assert(", index)) !== -1) {
            count++;
            index += "assert(".length;
        }
    }
    return count;
}

/**
 * 
 * @param {Anod} anod 
 */
async function run(files, tests, anod) {
    console.log("Expected " + await asserts(files) + " asserts.");
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        await test.run(anod);
    }
    report();
}

(async function() {
    const files = await fs.readdir(TEST_FOLDER);
    const tests = await Promise.all(files.map(file => import(path.join(TEST_FOLDER, file))));
    console.log("-- Testing bundled version --");
    await run(files, tests, anod);
    console.log("-- Testing minified version --");
    await run(files, tests, anodmin);
})();