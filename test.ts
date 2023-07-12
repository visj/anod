import { Mut, MutType, array } from './src/zorn';

const a1 = array([1, 2, 3]);

const m1 = a1.mut();

switch (m1.mut[0]) {
  case MutType.Push:
    const item = m1.args;
}