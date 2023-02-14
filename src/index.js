import { 
    root, dispose, val, owner,
    compute, $compute, when,
    data, value, nil, freeze, recover,
    peek, cleanup, Data, Value, Computation
} from './zorn';

window["root"] = root;
window["dispose"] = dispose;
window["val"] = val;
window["compute"] = compute;
window["$compute"] = $compute;
window["when"] = when;
window["data"] = data;
window["value"] = value;
window["nil"] = nil;
window["owner"] = owner;
window["freeze"] = freeze;
window["recover"] = recover;
window["peek"] = peek;
window["cleanup"] = cleanup;
window["Data"] = Data;
window["Value"] = Value;
window["Computation"] = Computation;