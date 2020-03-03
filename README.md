# axios-again

一个 axios 的重新请求的插件

## Installation
```bash
npm install axios-retry
```

## Note
该项目诞生缘由 axios-retry 在 `axios 0.19.0` 不生效的 bug（由于 0.19.0 merge config 时会移除掉所有的自定义的字段），在 `axios 0.19.1` 修复了，但是为防止后续的不稳定性出现，所以决定将重试次数放在外面，不在 config 中，以防止今后再出现这种现象


