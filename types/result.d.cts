declare function result<Params extends unknown[], Value>(value: (...params: Params) => Value, ...params: Params): Value;
declare function result<Value>(value: Value): Value;
export = result;
