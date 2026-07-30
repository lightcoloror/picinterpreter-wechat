declare namespace NodeJS {
  interface ProcessEnv {
    /** Public HTTPS origin of the deployed PicInterpreter/CBoard API. */
    TARO_APP_API_BASE_URL?: string
    TARO_APP_RELEASE_CHANNEL?: 'development' | 'preview' | 'production'
    TARO_APP_ENABLE_CLOUD_FEATURES?: string
    TARO_APP_ENABLE_AI_FEATURES?: string
    TARO_APP_ENABLE_OCR?: string
    TARO_APP_ENABLE_ONLINE_PICTOGRAMS?: string
    TARO_APP_ENABLE_DIALECT_ASR?: string
  }
}
