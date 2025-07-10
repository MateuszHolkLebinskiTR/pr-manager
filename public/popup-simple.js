// Minimal popup.js for testing
console.log('Popup script loaded');

function showStatus(message, type = 'info') {
  console.log('showStatus called:', message, type);
  const statusEl = document.getElementById('status-message');
  const statusText = document.getElementById('status-text');
  
  if (!statusEl || !statusText) {
    console.error('Status elements not found');
    return;
  }
  
  // Map custom types to Bootstrap alert classes
  const bootstrapTypes = {
    'info': 'alert-info',
    'success': 'alert-success', 
    'warning': 'alert-warning',
    'error': 'alert-danger'
  };
  
  statusEl.className = `alert ${bootstrapTypes[type] || 'alert-info'}`;
  statusText.textContent = message;
  statusEl.style.display = 'block';
  
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded in popup');
  
  // Test if elements exist
  const settingsBtn = document.getElementById('open-settings');
  const refreshBtn = document.getElementById('refresh-list');
  const checkBtn = document.getElementById('check-now');
  const showOverviewBtn = document.getElementById('show-pr-overview');
  
  console.log('Elements found:', {
    settingsBtn: !!settingsBtn,
    refreshBtn: !!refreshBtn,
    checkBtn: !!checkBtn,
    showOverviewBtn: !!showOverviewBtn
  });
  
  // Settings button
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      console.log('Settings clicked');
      showStatus('Settings clicked!', 'info');
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.openOptionsPage();
      }
    });
  }
  
  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('Refresh clicked');
      showStatus('Refresh clicked!', 'info');
    });
  }
  
  // Check Now button
  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      console.log('Check Now clicked');
      showStatus('Check Now clicked!', 'info');
    });
  }
  
  // Show PR Overview button
  if (showOverviewBtn) {
    showOverviewBtn.addEventListener('click', () => {
      console.log('Show PR Overview clicked');
      showStatus('Show PR Overview clicked!', 'info');
      
      // Show the overview section
      const overviewSection = document.getElementById('pr-overview-section');
      if (overviewSection) {
        overviewSection.style.display = 'block';
      }
    });
  }
  
  // Close PR Overview button
  const closeBtn = document.getElementById('close-pr-overview');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('Close Overview clicked');
      const overviewSection = document.getElementById('pr-overview-section');
      if (overviewSection) {
        overviewSection.style.display = 'none';
      }
    });
  }
});
