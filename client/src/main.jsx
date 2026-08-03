import React from 'react'
import ReactDOM from 'react-dom/client'
// Before App: importing App first pulls in every page's stylesheet through the
// module graph, which would put the reset and the tokens AFTER the components
// that build on them in the bundled CSS.
import './styles/base.css'
import './styles/theme.css'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
