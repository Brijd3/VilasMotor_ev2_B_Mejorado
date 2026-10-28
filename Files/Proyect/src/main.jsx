import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { FleetProvider } from './context/FleetProvider.jsx'
import { AuthProvider } from './context/AuthProvider.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <FleetProvider>
        <App />
      </FleetProvider>
    </AuthProvider>
  </StrictMode>,
)
