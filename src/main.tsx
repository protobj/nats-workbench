/**
 * 应用入口点。
 * 使用 React StrictMode 将根应用组件挂载到 DOM，
 * 并初始化 i18n 国际化。
 *
 * @file 入口点
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/i18n'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
