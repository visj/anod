import vm from "vm";
import fs from "node:fs";
import { exec } from "child_process";
import * as esbuild from "esbuild";

async function fileExists(path) {
    return await fs.promises.stat(path).then(() => true, () => false);
}

async function loadEnums() {
    const code = await fs.promises.readFile("./src/core.js", "utf-8");
    await vm.runInThisContext(code.split("/* __ENUMS__ */")[0]);
}

const replaceEnumPlugin = {
    name: "replaceEnumPlugin",
    setup: function (build) {
        build.onLoad({ filter: /\.js$/ }, async (args) => {
            let contents = await fs.promises.readFile(args.path, "utf8");
            var enums = { State, Stage };
            for (var name in enums) {
                var object = enums[name];
                for (var key in object) {
                    contents = contents.replaceAll(name + "." + key, object[key]);
                }
            }
            return { contents };
        });
    }
}

async function closureBundleBench() {
    return new Promise((resolve, reject) => {
        const cmd = [
            "google-closure-compiler",
            "-O ADVANCED",
            "--language_out ECMASCRIPT_NEXT",
            "--js src/core.js",
            "--js src/array.js",
            "--js src/types.js",
            "--js src/api.js",
            "--js bench/haile/anod/index.js",
            "--js_output_file bench/haile/anod/index.min.js"
        ];
        exec(cmd.join(" "), async (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            if (stderr) {
                console.error(stderr);
                return reject(stderr);
            }
            if (stdout.trim() !== "") {
                console.log(stdout);
            }
            resolve();
        });
    });
}

async function esbuildBundlePreact() {
    await esbuild.build({
        entryPoints: ["./bench/haile/preact/index.js"],
        bundle: true,
        minify: true,
        outfile: "./bench/haile/preact/index.min.js",
    });
}

async function esbuildBundleSjs() {
    await esbuild.build({
        entryPoints: ["./bench/haile/S/index.js"],
        bundle: true,
        minify: true,
        outfile: "./bench/haile/S/index.min.js",
    });
}

async function esbuildBundleSolid() {
    await esbuild.build({
        entryPoints: ["./bench/haile/solid/index.js"],
        bundle: true,
        minify: true,
        outfile: "./bench/haile/solid/index.min.js",
    });
}

async function esbuildBundleMaverick() {
    await esbuild.build({
        entryPoints: ["./bench/haile/maverick/index.js"],
        bundle: true,
        minify: true,
        outfile: "./bench/haile/maverick/index.min.js",
    });
}

async function esbuildBundleuSignal() {
    await esbuild.build({
        entryPoints: ["./bench/haile/usignal/index.js"],
        bundle: true,
        minify: true,
        outfile: "./bench/haile/usignal/index.min.js",
    });
}

async function bundleBench() {
    await Promise.all([
        closureBundleBench(),
        esbuildBundlePreact(),
        esbuildBundleSjs(),
        esbuildBundleSolid(),
        esbuildBundleMaverick(),
        esbuildBundleuSignal()
    ]);
}

async function bundleLibrary() {
    return new Promise((resolve, reject) => {
        const outfile = "./temp/closure.build.js";
        const cmd = [
            "google-closure-compiler",
            "-O ADVANCED",
            "--language_out ES5",
            "--js src/core.js",
            "--js src/array.js",
            "--js src/types.js",
            "--js src/entry.js",
            "--externs src/api.js",
            "--externs src/externs.js",
            "--js_output_file " + outfile
        ];
        exec(cmd.join(" "), async (err, stdout, stderr) => {
            if (err) {
                console.error(err);
            }
            if (stderr) {
                console.error(stderr);
            }
            const exists = await fileExists(outfile);
            if (!exists) {
                return reject("Closure did not generate output file");
            }
            let code = await fs.promises.readFile(outfile, "utf-8")
            const parts = code.split(/(window\.anod\.[\$\w]*)/g);
            let esm = parts[0];
            let iife = "var anod=(function(){" + parts[0] + "return{";
            for (let i = 1; i < parts.length - 1; i += 2) {
                let name = parts[i].slice(12);
                let content = parts[i + 1];
                if (i > 1) {
                    iife += ",";
                }
                if (content.startsWith("=function")) {
                    esm += "export function " + name + content.slice(9);
                    iife += name + ":" + content.slice(1, content.lastIndexOf(";"));
                } else {
                    let min = content.slice(1, content.indexOf(";"));
                    esm += "export { " + min + " as " + name + " };";
                    iife += name + ":" + content.slice(1, content.indexOf(";"));
                }
            }
            iife += "}})();";
            await fs.promises.writeFile("./dist/anod.js", iife);
            await fs.promises.writeFile("./dist/anod.mjs", esm);
            await fs.promises.rm("./temp/closure.build.js");
            resolve({ stdout, stderr });
        });
    });
}

async function closureBundleTests() {
    return new Promise((resolve, reject) => {
        const cmd = [
            "google-closure-compiler",
            "-O ADVANCED",
            "--language_out ECMASCRIPT_NEXT",
            "--js src/api.js",
            "--js src/core.js",
            "--js src/types.js",
            "--js test/helper/*",
            "--js test/tests/*",
            "--js test/index.js",
            "--js_output_file test/dist/closure.test.js"
        ];
        exec(cmd.join(" "), (err, stdout, stderr) => {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                if (stderr) {
                    console.error(stderr);
                }
                resolve({ stdout, stderr });
            }
        });
    });
}

async function esbuildBundleTests() {
    await esbuild.build({
        entryPoints: ["./test/index.js"],
        minify: true,
        bundle: true,
        treeShaking: true,
        mangleProps: /^_/,
        outfile: "./test/dist/esbuild.test.js",
        plugins: [replaceEnumPlugin],
    });
}

async function bundleTests() {
    await Promise.all([
        closureBundleTests(),
        esbuildBundleTests()
    ]);
}

async function main() {
    try {
        await loadEnums();
        await fs.promises.mkdir("./dist", { recursive: true });
        await Promise.allSettled([
            bundleBench(),
            // bundleTests(),
            bundleLibrary(),
        ]);
    } catch (err) {
        console.error(err);
    }
}

main();