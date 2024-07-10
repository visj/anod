import {
    root,
    sample,
    batch,
    cleanup,
    data,
    value,
    compute
} from "./core.js";
import { 
    array
} from "./array.js";

window["anod"]["root"] = root;
window["anod"]["sample"] = sample;
window["anod"]["batch"] = batch;
window["anod"]["cleanup"] = cleanup;
window["anod"]["data"] = data;
window["anod"]["value"] = value;
window["anod"]["array"] = array;
window["anod"]["compute"] = compute;