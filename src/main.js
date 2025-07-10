import './style.css'

// This file is not used in the Chrome extension popup. See popup.js and options.js for extension logic.
document.querySelector('#app').innerHTML = `
  <div class="card">
    <div class="card-header">
      <h1 class="card-title">🔄 PR Manager Chrome Extension</h1>
      <p class="card-subtitle">Streamline your GitHub PR review workflow</p>
    </div>
    
    <div class="flex flex-col items-center gap-4">
      <div class="notification info">
        <p>🚀 <strong>Development Mode</strong> - This page is for development purposes only.</p>
        <p>Use the Chrome extension popup to manage your GitHub PR pages and settings.</p>
      </div>
      
      <div class="button-group">
        <button onclick="chrome.runtime.openOptionsPage()" class="primary">
          <span>⚙️</span>
          Open Settings
        </button>
        <button onclick="window.open('https://github.com/settings/tokens', '_blank')" class="secondary">
          <span>🔑</span>
          GitHub Tokens
        </button>
      </div>
    </div>
  </div>
`
