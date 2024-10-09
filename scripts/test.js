import { exec } from "child_process";

var cmd = [
    "google-closure-compiler",
    "--compilation_level ADVANCED",
    "--language_out ES5",
    "--rewrite_polyfills false",
    "--externs externs/closure.js",
    "--js test/helper/*.js",
    "--js test/tests/core/*.js",
    "--js test/tests/array/*.js",
    "--js test/index.js",
    "--js build/index.js",
    "--js_output_file test/index.min.js"
];

exec(cmd.join(" "), function (err, stdout, stderr) {
    if (err) {
        console.error(err);
    } else if (stderr) {
        console.error(stderr);
    } else if (stdout != null && stdout.trim().length > 0) {
        console.log(stdout);
    }
});