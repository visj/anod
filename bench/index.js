const { exec } = require('child_process');
const { parseArgs } = require('util');

const {
    values: { target, name, framework, benchmark } 
} = parseArgs({
    options: {
        target: {
            type: 'string',
            short: 't',
        },
        name: {
            type: 'string',
            short: 'n',
        },
        framework: {
            type: 'string',
            short: 'f',
        },
        benchmark: {
            type: 'string',
            short: 'b',
        }
    },
    
});

const OS = process.platform;

switch (name) {
    case "haile": 
        switch (target) {
            case "node":
                exec(`node --allow-natives-syntax ./bench/${name}/${framework}/${benchmark}/index.js`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(err);
                    }
                    console.log(stdout); 
                });
                break;
            case "chrome":
                switch (OS) {
                    case "darwin":
                        exec(`/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --user-data-dir=./bench/.chrome-session --js-flags="--allow-natives-syntax" ./bench/haile/${framework}/${benchmark}/index.html`, (err, stdout, stderr) => {
                            if (err) {
                                console.error(err);
                            }
                            console.log(stdout);
                        });
                }
                break;
        }
}