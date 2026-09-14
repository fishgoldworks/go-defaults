/** Returns a promise that resolves after the specified number of milliseconds. */
function wait(delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

module.exports = wait;
