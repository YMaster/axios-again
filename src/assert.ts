const getType = (val: any) => {
  return Object.prototype.toString.call(val)
}

export const isFunction = (func: any) => getType(func) === '[object Function]'
export const isObject = (func: any) => getType(func) === '[object Object]'
export const isArray = (func: any) => getType(func) === '[object Array]'
export const isString = (func: any) => getType(func) === '[object String]'
export const isNumber = (func: any) => getType(func) === '[object Number]'