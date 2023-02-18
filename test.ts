import { array } from './';

const arr = array([1, 2, 3, 4, 5]);

arr.find((x, i) => {
  return true;
});

function test(x: void): void {

}
test(undefined);