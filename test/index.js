import { report } from "./helper/index.js";
import "./tests/core/batch.test.js";
import "./tests/core/compute.test.js";
import "./tests/core/dispose.test.js";
import "./tests/core/effect.test.js";
import "./tests/core/garbage.test.js";
import "./tests/core/root.test.js";
import "./tests/core/signal.test.js";
import "./tests/core/update.test.js";

import "./tests/array/array.test.js";
import "./tests/array/reduce.test.js";

process.on("exit", report);