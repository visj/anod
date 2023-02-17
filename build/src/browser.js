import {
    root, peek, batch, stable,
    recover, cleanup, dispose,
    data, value, array,
    compute, $compute,
    respond, $respond,
    effect, $effect
} from '../../src/zorn';

window["peek"] = peek;
window["batch"] = batch;
window["stable"] = stable;
window["recover"] = recover;
window["cleanup"] = cleanup;
window["dispose"] = dispose;
window["root"] = root;
window["data"] = data;
window["value"] = value;
window["array"] = array;
window["compute"] = compute;
window["$compute"] = $compute;
window["respond"] = respond;
window["$respond"] = $respond;
window["effect"] = effect;
window["$effect"] = $effect;