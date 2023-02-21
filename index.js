import { data, batch, root, compute } from './dist/zorn.mjs';

root(() => {
  const d1 = data(1);
  const d2 = data(2);
  compute(() => {
    console.log(d1.val + d2.val);
  });

  setInterval(() => {
    batch(() => {
      d1.set(d1.val + 1);
      d2.set(d2.val + 2);

    })
  }, 1000);
});