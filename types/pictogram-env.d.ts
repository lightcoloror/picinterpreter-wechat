declare namespace NodeJS {
  interface ProcessEnv {
    /** Public HTTPS origin of the deployed PicInterpreter/CBoard API. */
    TARO_APP_API_BASE_URL?: string
  }
}
