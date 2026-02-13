import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext({})

export const useTheme = () => useContext(ThemeContext)

// Dashboard types for separate theme storage
export const DASHBOARDS = {
  DEALER: 'dealer',
  SUPERADMIN: 'superadmin',
  USER: 'user',
  ADMIN: 'admin',
  GLOBAL: 'global'
}

// Theme types
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark'
}

// Storage key prefix
const THEME_STORAGE_PREFIX = 'lao_lotto_theme_'

// Get theme from localStorage for specific dashboard
function getStoredTheme(dashboard) {
  try {
    const stored = localStorage.getItem(`${THEME_STORAGE_PREFIX}${dashboard}`)
    if (stored && Object.values(THEMES).includes(stored)) {
      return stored
    }
  } catch (e) {
    // Ignore storage errors
  }
  return THEMES.DARK // Default to dark theme
}

// Save theme to localStorage for specific dashboard
function setStoredTheme(dashboard, theme) {
  try {
    localStorage.setItem(`${THEME_STORAGE_PREFIX}${dashboard}`, theme)
  } catch (e) {
    // Ignore storage errors
  }
}

export function ThemeProvider({ children }) {
  // Store themes for each dashboard separately
  const [themes, setThemes] = useState(() => ({
    [DASHBOARDS.DEALER]: getStoredTheme(DASHBOARDS.DEALER),
    [DASHBOARDS.SUPERADMIN]: getStoredTheme(DASHBOARDS.SUPERADMIN),
    [DASHBOARDS.USER]: getStoredTheme(DASHBOARDS.USER),
    [DASHBOARDS.ADMIN]: getStoredTheme(DASHBOARDS.ADMIN),
    [DASHBOARDS.GLOBAL]: getStoredTheme(DASHBOARDS.GLOBAL)
  }))

  // Detect initial dashboard from URL path (same logic as index.html inline script)
  const [activeDashboard, setActiveDashboard] = useState(() => {
    const path = window.location.pathname
    if (path.includes('/dealer')) return DASHBOARDS.DEALER
    if (path.includes('/superadmin')) return DASHBOARDS.SUPERADMIN
    if (path.includes('/user') || path === '/') return DASHBOARDS.USER
    if (path.includes('/admin')) return DASHBOARDS.ADMIN
    return DASHBOARDS.GLOBAL
  })

  // Get current theme based on active dashboard
  const currentTheme = themes[activeDashboard] || THEMES.DARK

  // Toggle theme for specific dashboard
  const toggleTheme = useCallback((dashboard = activeDashboard) => {
    setThemes(prev => {
      const newTheme = prev[dashboard] === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK
      setStoredTheme(dashboard, newTheme)
      return {
        ...prev,
        [dashboard]: newTheme
      }
    })
  }, [activeDashboard])

  // Set theme for specific dashboard
  const setTheme = useCallback((theme, dashboard = activeDashboard) => {
    if (!Object.values(THEMES).includes(theme)) return
    
    setThemes(prev => {
      setStoredTheme(dashboard, theme)
      return {
        ...prev,
        [dashboard]: theme
      }
    })
  }, [activeDashboard])

  // Get theme for specific dashboard
  const getTheme = useCallback((dashboard) => {
    return themes[dashboard] || THEMES.DARK
  }, [themes])

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement
    
    // Remove existing theme classes
    root.classList.remove('theme-light', 'theme-dark')
    
    // Add current theme class
    root.classList.add(`theme-${currentTheme}`)
    
    // Also set data attribute for CSS selectors
    root.setAttribute('data-theme', currentTheme)
  }, [currentTheme])

  const value = {
    theme: currentTheme,
    themes,
    activeDashboard,
    setActiveDashboard,
    toggleTheme,
    setTheme,
    getTheme,
    isDark: currentTheme === THEMES.DARK,
    isLight: currentTheme === THEMES.LIGHT,
    THEMES,
    DASHBOARDS
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
