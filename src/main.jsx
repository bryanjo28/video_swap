import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminPage from './AdminPage.jsx'
import DisplayPage from './DisplayPage.jsx'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const Page =
  normalizedPath === '/admin'
    ? AdminPage
    : normalizedPath === '/display'
      ? DisplayPage
      : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
