import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const shouldAnalyzeWeappBundle = process.env.WEAPP_BUNDLE_ANALYZE === '1'
let buildRevision = 'unknown'
try {
  buildRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8'
  }).trim()
} catch (_) {}
class ReleaseFeatureManifestPlugin {
  constructor(flags) { this.flags = flags }
  apply(compiler) {
    compiler.hooks.afterEmit.tap('ReleaseFeatureManifestPlugin', () => {
      const root = compiler.outputPath
      const files = []
      const visit = relative => {
        const directory = path.join(root, relative)
        for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const child = path.join(relative, entry.name)
          if (entry.isDirectory()) visit(child)
          else if (child.replace(/\\/g, '/') !== 'release-feature-manifest.json') files.push(child)
        }
      }
      visit('')
      const hash = createHash('sha256')
      for (const file of files) hash.update(file.replace(/\\/g, '/')).update('\0').update(readFileSync(path.join(root, file))).update('\n')
      writeFileSync(path.join(root, 'release-feature-manifest.json'), `${JSON.stringify({ ...this.flags, artifactFingerprint: hash.digest('hex') }, null, 2)}\n`)
    })
  }
}
const weappStatsFilename = path.resolve(__dirname, '../.bundle-analysis/weapp-stats.json')

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command: _command, mode: _mode }) => {
  const envValue = name => String(process.env[name] || '').trim()
  const boolEnv = name => (envValue(name).toLowerCase() === 'true' ? 'true' : '')
  const outputRoot = process.env.TARO_APP_OUTPUT_ROOT || 'dist'
  const releaseFlags = {
    schema: 1, marker: 'cboard-release-feature-manifest-v1', sourceRevision: buildRevision,
    releaseChannel: envValue('TARO_APP_RELEASE_CHANNEL') || 'development',
    apiBaseUrl: envValue('TARO_APP_API_BASE_URL'),
    careCollaboration: boolEnv('TARO_APP_CARE_COLLABORATION') === 'true',
    cloudFeatures: boolEnv('TARO_APP_ENABLE_CLOUD_FEATURES') === 'true',
    publicTrial: boolEnv('TARO_APP_CARE_PUBLIC_TRIAL') === 'true'
  }
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
    outputRoot,
    alias: {
      react: path.resolve(__dirname, '../node_modules/react'),
      '@cboard-communication-core': path.resolve(
        __dirname,
        '../../cboard/src/common/communicationSupport'
      )
    },
    plugins: ["@tarojs/plugin-generator"],
    defineConstants: {
      'process.env.TARO_APP_CARE_COLLABORATION': JSON.stringify(boolEnv('TARO_APP_CARE_COLLABORATION')),
      'process.env.TARO_APP_CARE_PUBLIC_TRIAL': JSON.stringify(boolEnv('TARO_APP_CARE_PUBLIC_TRIAL')),
      'process.env.TARO_APP_API_BASE_URL': JSON.stringify(envValue('TARO_APP_API_BASE_URL')),
      'process.env.TARO_APP_SOURCE_CODE_URL': JSON.stringify(
        process.env.TARO_APP_SOURCE_CODE_URL || ''
      ),
      'process.env.TARO_APP_RELEASE_CHANNEL': JSON.stringify(
        envValue('TARO_APP_RELEASE_CHANNEL') || 'development'
      ),
      'process.env.TARO_APP_ENABLE_CLOUD_FEATURES': JSON.stringify(
        boolEnv('TARO_APP_ENABLE_CLOUD_FEATURES')
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
          to: path.join(outputRoot, 'assets/cboard-default')
        },
        {
          from: 'src/assets/emergency',
          to: path.join(outputRoot, 'packages/emergency/assets/emergency')
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
        chain.plugin('release-feature-manifest').use(ReleaseFeatureManifestPlugin, [releaseFlags])
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.module.rule('care-shared-panel')
          .test(/[Cc]are[^/\\]*\.js$/)
          .include.add(path.resolve(__dirname, '../../cboard/src/common/communicationSupport')).end()
          .use('babel-loader').loader(require.resolve('babel-loader'))
          .options({ babelrc: false, configFile: false,
            plugins: [require.resolve('@babel/plugin-transform-optional-chaining'), require.resolve('@babel/plugin-transform-nullish-coalescing-operator')],
            presets: [[require.resolve('babel-preset-taro'), { framework: 'react', ts: false, compiler: 'webpack5' }]] })

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
