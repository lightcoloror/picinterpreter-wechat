// babel-preset-taro 更多选项和默认值：
// https://docs.taro.zone/docs/next/babel-config
module.exports = {
  plugins: [
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-transform-optional-chaining'
  ],
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      compiler: 'webpack5',
    }]
  ]
}
