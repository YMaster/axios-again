export type safeStatusCodesToRetryType = Array<number | [number, number]>
export const isSafeStatusCodesToRetry = (statusCodesToRetry: any) => {
  return Array.isArray(statusCodesToRetry) && statusCodesToRetry.every((item) => {
    return typeof item === 'number' ||
      (Array.isArray(item) && item.length === 2 && item.every((subitem) => typeof subitem === 'number'))
  })
}
interface IStringKeyObject {
  [key: string]: any
}
export const isSameObject = (obj1: IStringKeyObject, obj2: IStringKeyObject): boolean => {
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)
  if (keys1.length === keys2.length) {
    return keys1.every((key) => obj1[key] === obj2[key])
  }
  return false
}