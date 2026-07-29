import { createElement, Fragment, PropsWithChildren } from 'react'

import PrivacyAuthorizationGate from './features/privacy/PrivacyAuthorizationGate'
import AppUpdateBanner from './features/update/AppUpdateBanner'
import './app.css'

function App({ children }: PropsWithChildren<any>) {
  return createElement(
    Fragment,
    null,
    createElement(AppUpdateBanner),
    createElement(PrivacyAuthorizationGate),
    children
  )
}

export default App
