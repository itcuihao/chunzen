/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/webviews/sidePanel/**/*.{html,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bridge VS Code Theme variables
        background: 'var(--vscode-sideBar-background, var(--vscode-editor-background, #0f1117))',
        foreground: 'var(--vscode-sideBar-foreground, var(--vscode-editor-foreground, #e2e8f0))',
        'editor-bg': 'var(--vscode-editor-background, #0f1117)',
        'editor-fg': 'var(--vscode-editor-foreground, #e2e8f0)',
        border: 'var(--vscode-sideBar-border, var(--vscode-panel-border, var(--vscode-widget-border, #2a3347)))',
        
        primary: {
          DEFAULT: 'var(--vscode-button-background, #4f8ef7)',
          foreground: 'var(--vscode-button-foreground, #ffffff)',
          hover: 'var(--vscode-button-hoverBackground, #3d7be6)',
        },
        
        secondary: {
          DEFAULT: 'var(--vscode-button-secondaryBackground, #1e2535)',
          foreground: 'var(--vscode-button-secondaryForeground, #8892a4)',
          hover: 'var(--vscode-button-secondaryHoverBackground, #2a3347)',
        },
        
        // Custom Academic & Premium colors
        accent: {
          DEFAULT: 'var(--accent, #4f8ef7)',
          glow: 'var(--accent-glow, rgba(79, 142, 247, 0.15))',
        },
        success: 'var(--success, #48bb78)',
        warning: 'var(--warning, #f6ad55)',
        error: 'var(--error, #fc8181)',
        cached: 'var(--cached, #68d391)',
        
        // Dark theme cards with glassmorphism values
        card: {
          DEFAULT: 'var(--card-bg, rgba(30, 41, 59, 0.4))',
          border: 'var(--card-border, rgba(255, 255, 255, 0.05))',
          hover: 'var(--card-hover, rgba(30, 41, 59, 0.6))',
        }
      },
      borderRadius: {
        lg: "var(--radius, 10px)",
        md: "calc(var(--radius, 10px) - 2px)",
        sm: "calc(var(--radius, 10px) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
        serif: ['Georgia', 'serif'],
        zhSerif: ['Noto Serif SC', 'STSong', 'serif'],
      },
      boxShadow: {
        glow: '0 0 15px rgba(79, 142, 247, 0.15)',
        warningGlow: '0 0 15px rgba(252, 129, 129, 0.2)',
      },
      animation: {
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
  // We specify prefix or class based dark mode if needed
  darkMode: 'class',
}
