/**
 * Shallowly merges objects from left to right without replacing an existing
 * property with `undefined`.
 */
function withDefaults(...objects) {
  const result = {};

  if (objects.length === 0) {
    return result;
  }

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
          result[key] = obj[key];
        }
      }
    }
  }

  return result;
}

module.exports = withDefaults;
