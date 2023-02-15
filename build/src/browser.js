import { 
    root, dispose, val, owner,
    compute, $compute, when, peek,
    data, value, nil, freeze, recover,
    cleanup, Data, Value, Computation
} from '../../src/zorn';

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
window["peek"] = peek;
window["freeze"] = freeze;
window["recover"] = recover;
window["cleanup"] = cleanup;
window["Data"] = Data;
window["Value"] = Value;
window["Computation"] = Computation;