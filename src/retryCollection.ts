import { AxiosRequestConfig, AxiosError, Method, AxiosInstance } from 'axios'
import isRetryAllowed from 'is-retry-allowed'
import {
  isFunction,
  // isObject,
  // isString,
  isNumber,
  // isArray,
} from './assert'
import { safeStatusCodesToRetryType, isSafeStatusCodesToRetry, isSameObject } from './utils'

export interface IRetryConfig {
  /**
   * 重试次数
   */
  retries?: number
  /**
   * 重试延迟
   */
  retryDelay?: number
  /**
   * 哪些 HTTP 的请求方式可以重试
   */
  httpMethodsToRetry?: string[]
  /**
   * 哪些状态码会重试  例如：503 或 [[100, 199], [429, 429], [500, 599]]
   * default: [[100, 199], [429], [500, 599]]
   */
  statusCodesToRetry?: safeStatusCodesToRetryType
  /**
   * willRetry：开始准备重试（重试前延时开始时）
   * startRetry：开始重试
   */
  willRetry?: (err: AxiosError) => void
  startRetry?: (err: AxiosError) => void
  /**
   * 自定义的判断是否重试
   */
  shouldRetry?: (err: AxiosError) => boolean
  /**
   * 自定义重试方法的最大限制，可用于防止 shouldRetry 判断出现意外导致无限重试
   * default: Infinity
   */
  shouldRetryLimt?: number
  /**
   * 是否在重置时刷新超时时间
   * true：每次重试都会重新计算超时时间
   * false：每次都不会重新计算时间
   */
  // shouldResetTimeout?: boolean
}
export interface IRequestConfig extends AxiosRequestConfig {
  retryRequestId?: number
  retryCount?: number
  // retries?: number
  // retryConfig?: IRetryConfig
}
interface IRetryRequestItem {
  id: number
  retryCount: number
  // retries: number,
  lastRetryTimestamp: number
  requestTimes: number[]
  requestConfig: IRequestConfig
}

const SAFE_HTTP_METHODS: Array<Method> = ['get', 'head', 'options']
const IDEMPOTENT_HTTP_METHODS: Array<Method> = SAFE_HTTP_METHODS.concat(['put', 'delete'])

class RetryCollection {
  private list: IRetryRequestItem[] = []
  private lastRetryRequestId: number = 0
  /**
   * 是否为网络错误
   */
  public isNetworkError = (error: AxiosError) => {
    return (
      !error.response &&
      Boolean(error.code) && // Prevents retrying cancelled requests
      error.code !== 'ECONNABORTED' && // Prevents retrying timed out requests
      isRetryAllowed(error)
    ) // Prevents retrying unsafe errors
  }
  /**
   * 是否为超时
   */
  public isTimeout = (error: AxiosError) => {
    return error.code === 'ECONNABORTED' && (error.stack?.includes('timeout') || error.message.includes('timeout'))
  }
  /**
   * 接口无返回错误
   */
  public isRetryableError = (error: AxiosError) => {
    return error.code !== 'ECONNABORTED' && !error.response
  }
  /**
   * 服务端错误
   */
  public isServerError = (error: AxiosError) => {
    return error.code !== 'ECONNABORTED' && (error.response?.status! >= 500 && error.response?.status! <= 599)
  }
  /**
   * 判断是否复合重试的 httpCode
   */
  public isShouldRetryCode = (error: AxiosError): boolean => {
    const httpCode = error.response?.status || 0
    if (httpCode === 0) {
      return true
    }
    const res = this.retryConfig.statusCodesToRetry?.some((item) => {
      if (isNumber(item)) {
        return httpCode === item
      } else {
        const arr = item as [number, number]
        return httpCode <= Math.max(arr[0], arr[1]) && httpCode >= Math.min(arr[0], arr[1])
      }
    })
    return Boolean(res)
  }
  /**
   * 是否是正常的请求
   */
  public isSafeRequestError = (error: AxiosError) => {
    return Boolean(error.config) && this.isRetryableError(error) && SAFE_HTTP_METHODS.includes(error.config.method!)
  }
  /**
   * 正常的请求以及请求方式吻合
   */
  public isIdempotentRequestError = (error: AxiosError) => {
    if (!error.config) {
      return false
    }
    return this.isRetryableError(error) && IDEMPOTENT_HTTP_METHODS.includes(error.config.method!)
  }
  /**
   * 默认的重试判断
   */
  private shouldRetryDefault = (err: AxiosError): boolean => {
    return this.isNetworkError(err) && this.isSafeRequestError(err) && this.isShouldRetryCode(err) && !this.isServerError(err)
  }
  /**
   * 默认配置
   */
  private retryConfig: IRetryConfig = {
    retries: 3,
    retryDelay: 0,
    httpMethodsToRetry: IDEMPOTENT_HTTP_METHODS,
    statusCodesToRetry: [[100, 199], 429, [500, 599]],
    willRetry: (error: AxiosError) => void 0,
    startRetry: (error: AxiosError) => void 0,
    shouldRetry: this.shouldRetryDefault,
    shouldRetryLimt: Infinity,
  }
  /**
   * 在在队列中寻找当前请求
   */
  private findItem = (config: IRequestConfig): IRetryRequestItem | undefined => {
    console.log(config, 'config')
    let res = this.list.find((item) => item.id === config.retryRequestId)
    if (!res) {
      res = this.list.find((item) => {
        const {requestConfig: { url, method, data, params = {}, headers = {} }} = item
        const isSameUrl = url === config.url
        const isSameMethod = method === config.method
        const isSameData = data === config.data
        const isSameParams = isSameObject(params, config.params || {})
        const isSameHeaders = isSameObject(headers, config.headers || {})
        return isSameUrl && isSameMethod && isSameData && isSameParams && isSameHeaders
      })
    }
    console.log()
    return res
  }
  /**
   * 查找当前请求所在的
   */
  private findItemIndex = (config: IRequestConfig): number => this.list.findIndex((item) => item.id === config.retryRequestId)
  /**
   * 初始化配置
   */
  public initConfig = (config: IRetryConfig) => {
    if (typeof config.retries === 'number' && config.retries >= 0) {
      this.retryConfig.retries = config.retries
    }
    if (config.retryDelay && config.retryDelay > 0) {
      this.retryConfig.retryDelay = config.retryDelay
    }
    if (Array.isArray(config.httpMethodsToRetry)) {
      this.retryConfig.httpMethodsToRetry = config.httpMethodsToRetry
    }
    if (isSafeStatusCodesToRetry(config.statusCodesToRetry)) {
      this.retryConfig.statusCodesToRetry = config.statusCodesToRetry
    }
    if (isFunction(config.shouldRetry)) {
      this.retryConfig.shouldRetry = config.shouldRetry
    }
    if (config.shouldRetryLimt && config.shouldRetryLimt > 0) {
      this.retryConfig.shouldRetryLimt = config.shouldRetryLimt
    }
    if (isFunction(config.willRetry)) {
      this.retryConfig.willRetry = config.willRetry
    }
    if (isFunction(config.startRetry)) {
      this.retryConfig.startRetry = config.startRetry
    }
  }
  /**
   * 添加一个请求到队列
   */
  public add = (config: IRequestConfig): IRequestConfig => {
    let reteryItem = this.findItem(config)
    const nowTime = Date.now()
    if (!reteryItem) {
      const retryRequestId = this.lastRetryRequestId + 1
      this.lastRetryRequestId += 1
      reteryItem = {
        id: retryRequestId,
        retryCount: 0,
        lastRetryTimestamp: nowTime,
        requestTimes: [nowTime],
        requestConfig: Object.assign({}, config, {
          retryRequestId,
          retryCount: 0,
        }) as IRequestConfig
      }
      this.list.push(reteryItem)
    } else {
      reteryItem.lastRetryTimestamp = nowTime
      reteryItem.requestTimes.push(nowTime)
      reteryItem.retryCount += 1
      reteryItem.requestConfig.retryCount = reteryItem.retryCount
    }
    return reteryItem!.requestConfig
  }
  /**
   * 移除队列中一个请求
   */
  public remove = (config: IRequestConfig): boolean => {
    const index = this.findItemIndex(config)
    if (index > -1) {
      this.list.splice(index, 1)
      return true
    }
    return false
  }
  /**
   * 判断是否需要重试
   */
  public shouldRetry = (error: AxiosError) => {
    const config = error.config as IRequestConfig;
    if (!config || this.retryConfig.retries === 0) {
      return false
    }
    const { retries } = this.retryConfig
    const currentState = this.findItem(config)
    if (retries! > currentState?.retryCount!) {
      return this.retryConfig.shouldRetry!(error)
    }
    return false
  }
  /**
   * 获取重试延迟时间
   */
  public getDelay = () => this.retryConfig.retryDelay!
  /**
   * 重整 config
   */
  public fixConfig = (axios: AxiosInstance, config: AxiosRequestConfig) => {
    if (axios.defaults.httpAgent === config.httpAgent) {
      delete config.httpAgent;
    }
    if (axios.defaults.httpsAgent === config.httpsAgent) {
      delete config.httpsAgent;
    }
  }
  /**
   * 即将重试
   */
  public willRetry = (error: AxiosError) => {
    if (this.retryConfig.willRetry && isFunction(this.retryConfig.willRetry)) {
      this.retryConfig.willRetry(error)
    }
  }
  /**
   * 开始重试
   */
  public startRetry = (error: AxiosError) => {
    if (this.retryConfig.startRetry && isFunction(this.retryConfig.startRetry)) {
      this.retryConfig.startRetry(error)
    }
  }
}

export default new RetryCollection()
