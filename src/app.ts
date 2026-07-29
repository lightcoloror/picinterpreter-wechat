import { createElement, Fragment, PropsWithChildren } from 'react'

import AppUpdateBanner from './features/update/AppUpdateBanner'
import './app.css'

function App({ children }: PropsWithChildren<any>) {
  return createElement(
    Fragment,
    null,
    createElement(AppUpdateBanner),
    children
  )
}

export default App
