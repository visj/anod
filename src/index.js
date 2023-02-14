import { 
    root, dispose, val, owner, listener,
    compute, $compute, effect, $effect, when,
    data, value, nil, freeze, recover,
    peek, cleanup, Data, Value, Computation
} from './zorn';

window["root"] = root;
window["dispose"] = dispose;
window["val"] = val;
window["compute"] = compute;
window["$compute"] = $compute;
window["effect"] = effect;
window["$effect"] = $effect;
window["when"] = when;
window["data"] = data;
window["value"] = value;
window["nil"] = nil;
window["owner"] = owner;
window["listener"] = listener;
window["freeze"] = freeze;
window["recover"] = recover;
window["peek"] = peek;
window["cleanup"] = cleanup;
window["Data"] = Data;
window["Value"] = Value;
window["Computation"] = Computation;