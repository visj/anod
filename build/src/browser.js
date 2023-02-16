import {
    peek, stable, batch,
    recover, cleanup, dispose,
    root, val, signal,
    compute, $compute,
    effect, $effect,
} from '../../src/zorn';

window["peek"] = peek;
window["stable"] = stable;
window["batch"] = batch;
window["recover"] = recover;
window["cleanup"] = cleanup;
window["dispose"] = dispose;
window["root"] = root;
window["val"] = val;
window["signal"] = signal;
window["compute"] = compute;
window["$compute"] = $compute;
window["effect"] = effect;
window["$effect"] = $effect;