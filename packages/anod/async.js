function test() {
  if (Math.random() < 0.5) {
    return 5;
  }
  return Promise.resolve(5);
}

(async function main() {
  let a = await test();
  console.log(a);
}());

console.log("ran");
