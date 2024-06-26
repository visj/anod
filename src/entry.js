import {
    root,
    sample,
    batch,
    cleanup,
    data,
    value,
    compute,
    $compute
} from "./core.js";

window["zorn"].root = root;
window["zorn"].sample = sample;
window["zorn"].batch = batch;
window["zorn"].cleanup = cleanup;
window["zorn"].data = data;
window["zorn"].value = value;
window["zorn"].compute = compute;
window["zorn"].$compute = $compute;