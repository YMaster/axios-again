import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
} from 'axios'
import retryCollection, { IRequestConfig, IRetryConfig } from './retryCollection'

const retryInit = (config: IRetryConfig) => {
  retryCollection.initConfig(config)
}
const axiosRetry = (instance?: AxiosInstance, config?: IRetryConfig) => {
  if (config) {
    retryInit(config)
  }
  const requester = instance ?? axios
  requester.interceptors.request.use((config: AxiosRequestConfig) => {
    // console.log('interceptors.request: ', config)
    return retryCollection.add(config)
  }, (error: AxiosError) => {
    return Promise.reject(error)
  })
  requester.interceptors.response.use((response) => {
    retryCollection.remove(response.config)
    // console.dir(response)
    return response
  }, (error) => {
    // console.dir(error)
    const config = error.config as IRequestConfig
    const shouldRetry = retryCollection.shouldRetry(error)
    const delay = retryCollection.getDelay()
    // console.log('interceptors.response: ', config, shouldRetry, delay)

    retryCollection.fixConfig(axios, config)
    if (shouldRetry) {
      config.transformRequest = [data => data]
      // config.retryCount
      retryCollection.willRetry(error)
      return new Promise(resolve => {
        // console.time('delay')
        setTimeout(() => {
          // console.timeEnd('delay')
          retryCollection.startRetry(error)
          resolve(requester.request(config))
        }, delay)
      })
    } else {
      retryCollection.remove(config)
    }
    return Promise.reject(error)
  })
  return requester
}

axiosRetry.retryInit = retryInit
axiosRetry.isTimeout = retryCollection.isTimeout
axiosRetry.isShouldRetryCode = retryCollection.isShouldRetryCode
axiosRetry.isServerError = retryCollection.isServerError
axiosRetry.isSafeRequestError = retryCollection.isSafeRequestError
axiosRetry.isRetryableError = retryCollection.isRetryableError
axiosRetry.isNetworkError = retryCollection.isNetworkError
axiosRetry.isIdempotentRequestError = retryCollection.isIdempotentRequestError

export default axiosRetry
