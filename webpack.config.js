// import webpack from 'webpack'
const path = require('path')

const buildType = process.env.BUILD_TYPE
console.log('buildType: ', buildType)
module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, `./dist/${buildType}`),
    filename: 'index.js',
    libraryTarget: buildType,
    library: 'axRetry',
  },
  module: {
    rules: [{
      test: /\.ts$/,
      use: ['babel-loader', 'ts-loader'],
    },
    {
      test: /\.js$/,
      use: ['babel-loader']
    }]
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
}