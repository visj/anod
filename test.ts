import { array, Mutation } from './dist/zorn';

const a = array([1, 2, 3]);

const mut = a.mut();

a.find(x => {
    return true;
});

switch (mut[0]) {
    case Mutation.InsertRange:
        var [index, _, items] = mut[1];
        break;
    case Mutation.ReplaceRangeInsert:
        var [index, deleteCount, items] = mut[1];
}