const resultPrototype = Object.prototype;
const { hasOwnProperty } = resultPrototype;

function writeOwn(target, key, value, descriptor) {
  // Result objects are ordinary records. Only inherited names need the safe write.
  if (!hasOwnProperty.call(resultPrototype, key) || hasOwnProperty.call(target, key)) {
    target[key] = value;
  } else {
    if (descriptor === undefined) {
      descriptor = { value: undefined, enumerable: true, writable: true, configurable: true };
    }

    descriptor.value = value;
    // Source getters can install inherited descriptor fields between writes.
    if ('get' in descriptor || 'set' in descriptor) {
      Object.setPrototypeOf(descriptor, null);
    }

    Object.defineProperty(target, key, descriptor);
  }

  return descriptor;
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === null || prototype === Object.prototype;
}

function canMergeInto(target, key, incoming) {
  return Object.prototype.hasOwnProperty.call(target, key) && isRecord(target[key]) && isRecord(incoming);
}

function openRecord(earlier, incoming, depth, ownedRecords) {
  let target = earlier;

  // Only records created by this call can be updated in place.
  if (!ownedRecords || !ownedRecords.has(earlier)) {
    target = {};
    let descriptor;

    // Earlier values include any accepted own undefined values.
    for (const key of Reflect.ownKeys(earlier)) {
      if (Object.prototype.propertyIsEnumerable.call(earlier, key)) {
        descriptor = writeOwn(target, key, earlier[key], descriptor);
      }
    }

    if (ownedRecords) ownedRecords.add(target);
  }

  return { incoming, target, depth, keys: Reflect.ownKeys(incoming), nextIndex: 0 };
}

function mergeRecords(earlier, incoming, depth, shouldFallback, ownedRecords) {
  const first = openRecord(earlier, incoming, depth, ownedRecords);
  const stack = [first];
  let descriptor;

  // Descend depth-first without using the JavaScript call stack.
  while (stack.length) {
    const frame = stack[stack.length - 1];

    if (frame.nextIndex === frame.keys.length) {
      stack.pop();
      continue;
    }

    const key = frame.keys[frame.nextIndex++];

    if (!Object.prototype.propertyIsEnumerable.call(frame.incoming, key)) {
      continue;
    }

    const value = frame.incoming[key];

    if (shouldFallback ? shouldFallback(value, key) : value === undefined) {
      continue;
    }

    if (frame.depth > 0 && canMergeInto(frame.target, key, value)) {
      const nested = openRecord(frame.target[key], value, frame.depth - 1, ownedRecords);

      stack.push(nested);
      descriptor = writeOwn(frame.target, key, nested.target, descriptor);
    } else {
      descriptor = writeOwn(frame.target, key, value, descriptor);
    }
  }

  return first.target;
}

function mergeDefaults(defaults, overrides, shouldFallback, mergeDepth = 0) {
  const merged = {};
  let descriptor;
  let ownedRecords;

  // Process defaults before overrides without allocating another array.
  for (let index = -1; index < overrides.length; index += 1) {
    const object = index === -1 ? defaults : overrides[index];

    // Keep null separate so consumer minifiers do not also skip document.all.
    if (object === null) {
      continue;
    }

    if (typeof object !== 'object') {
      if (object === undefined) {
        continue;
      }

      throw new TypeError('Source layers must be objects, null, or undefined.');
    }

    // include symbols and check each property's current enumerability.
    for (const key of Reflect.ownKeys(object)) {
      if (!Object.prototype.propertyIsEnumerable.call(object, key)) {
        continue;
      }

      // capture accessor values once so checking and copying cannot diverge.
      const value = object[key];
      const fallback = index >= 0 && shouldFallback ? shouldFallback(value, key) : value === undefined;

      if (!fallback) {
        let accepted = value;

        if (mergeDepth > 0 && index >= 0 && canMergeInto(merged, key, value)) {
          if (!ownedRecords && index < overrides.length - 1) ownedRecords = new WeakSet();

          accepted = mergeRecords(merged[key], value, mergeDepth - 1, shouldFallback, ownedRecords);
        }

        descriptor = writeOwn(merged, key, accepted, descriptor);
      }
    }
  }

  return merged;
}

module.exports = mergeDefaults;
