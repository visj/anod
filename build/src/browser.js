import {
    root, dispose, val,
    compute, $compute, peek, stable,
    signal, batch, recover, cleanup
} from '../../src/zorn';

window["root"] = root;
window["dispose"] = dispose;
window["val"] = val;
window["compute"] = compute;
window["$compute"] = $compute;
window["peek"] = peek;
window["signal"] = signal;
window["batch"] = batch;
window["stable"] = stable;
window["recover"] = recover;
window["cleanup"] = cleanup;