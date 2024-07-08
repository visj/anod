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
import { 
    array
} from "./array.js";

window["anod"].root = root;
window["anod"].sample = sample;
window["anod"].batch = batch;
window["anod"].cleanup = cleanup;
window["anod"].data = data;
window["anod"].value = value;
window["anod"].compute = compute;
window["anod"].$compute = $compute;

window["anod"].array = array;