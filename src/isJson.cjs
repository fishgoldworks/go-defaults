/** Returns whether a value is a syntactically valid JSON string. */
function isJson(value) {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return true;
    } catch (err) {
      return false;
    }
  }
  return false;
}

module.exports = isJson;
