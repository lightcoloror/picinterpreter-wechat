import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const shouldAnalyzeWeappBundle = process.env.WEAPP_BUNDLE_ANALYZE === '1'
const weappStatsFilename = path.resolve(__dirname, '../.bundle-analysis/weapp-stats.json')

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command: _command, mode: _mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'cboard-wechat-poc',
    date: '2026-7-15',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    alias: {
      '@cboard-communication-core': path.resolve(
        __dirname,
        '../../cboard/src/common/communicationSupport'
      )
    },
    plugins: [
      "@tarojs/plugin-generator"
    ],
    defineConstants: {
      'process.env.TARO_APP_API_BASE_URL': JSON.stringify(
        process.env.TARO_APP_API_BASE_URL || ''
      ),
      'process.env.TARO_APP_SOURCE_CODE_URL': JSON.stringify(
        process.env.TARO_APP_SOURCE_CODE_URL || ''
      ),
      'process.env.TARO_APP_RELEASE_CHANNEL': JSON.stringify(
        process.env.TARO_APP_RELEASE_CHANNEL || 'development'
      ),
      'process.env.TARO_APP_ENABLE_CLOUD_FEATURES': JSON.stringify(
        process.env.TARO_APP_ENABLE_CLOUD_FEATURES || ''
      ),
      'process.env.TARO_APP_ENABLE_AI_FEATURES': JSON.stringify(
        process.env.TARO_APP_ENABLE_AI_FEATURES || ''
      ),
      'process.env.TARO_APP_ENABLE_OCR': JSON.stringify(
        process.env.TARO_APP_ENABLE_OCR || ''
      ),
      'process.env.TARO_APP_ENABLE_ONLINE_PICTOGRAMS': JSON.stringify(
        process.env.TARO_APP_ENABLE_ONLINE_PICTOGRAMS || ''
      ),
      'process.env.TARO_APP_ENABLE_DIALECT_ASR': JSON.stringify(
        process.env.TARO_APP_ENABLE_DIALECT_ASR || ''
      )
    },
    copy: {
      patterns: [
        {
          from: 'src/assets/cboard-default',
          to: 'dist/assets/cboard-default'
        },
        {
          from: 'src/assets/emergency',
          to: 'dist/packages/emergency/assets/emergency'
        }
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    mini: {
      optimizeMainPackage: {
        enable: true
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)

        if (shouldAnalyzeWeappBundle) {
          chain.plugin('weapp-bundle-analyzer').use(BundleAnalyzerPlugin, [{
            analyzerMode: 'disabled',
            generateStatsFile: true,
            openAnalyzer: false,
            statsFilename: weappStatsFilename
          }])
        }
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }


  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
