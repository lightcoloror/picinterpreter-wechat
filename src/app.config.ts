export default defineAppConfig({
  pages: ['pages/index/index'],
  subPackages: [
    {
      root: 'packages/caregiver',
      pages: ['pages/patient/index', 'pages/receiver/index']
    },
    {
      root: 'packages/emergency',
      pages: ['pages/index/index']
    },
    {
      root: 'packages/management',
      pages: ['pages/index/index']
    },
    {
      root: 'packages/backup',
      pages: [
        'pages/library/index',
        'pages/personal-images/index',
        'pages/public-boards/index',
        'pages/boards/index'
      ]
    },
    {
      root: 'packages/aac-import',
      pages: ['pages/index/index']
    },
    {
      root: 'packages/ocr',
      pages: ['pages/capture/index']
    }
  ],
  lazyCodeLoading: 'requiredComponents',
  plugins: {
    WechatSI: {
      version: process.env.TARO_APP_WECHAT_SI_VERSION || '0.3.4',
      provider: 'wx069ba97219f66d99'
    }
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#153f36',
    navigationBarTitleText: '图语家',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f4efe4'
  }
})

