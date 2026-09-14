/** Parses primitive booleans, boolean strings, and Boolean objects. */
function parseBool(value) {
  switch (typeof value) {
    case 'boolean':
      return value;
    case 'string': {
      const str = value.trim().toLowerCase();
      if (str === 'true') {
        return true;
      } else if (str === 'false') {
        return false;
      }
      break;
    }
    case 'object':
      if (value instanceof Boolean) {
        return value.valueOf();
      }
  }
  return undefined;
}

module.exports = parseBool;
