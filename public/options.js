// Handles settings/options for PR Manager
// Loads and saves settings, handles export/import, MS Teams message generation

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const intervalInput = document.getElementById('interval');
  const workingHoursInput = document.getElementById('working-hours');
  const showHistoryInput = document.getElementById('show-history');
  const customMessageInput = document.getElementById('custom-message');
  const githubTokenInput = document.getElementById('github-token');

  chrome.storage.sync.get({
    interval: 60,
    workingHours: '09:00-18:00',
    showHistory: false,
    customMessage: '',
    githubToken: ''
  }, (data) => {
    intervalInput.value = data.interval;
    workingHoursInput.value = data.workingHours;
    showHistoryInput.checked = data.showHistory;
    customMessageInput.value = data.customMessage;
    githubTokenInput.value = data.githubToken;
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    chrome.storage.sync.set({
      interval: Number(intervalInput.value),
      workingHours: workingHoursInput.value,
      showHistory: showHistoryInput.checked,
      customMessage: customMessageInput.value,
      githubToken: githubTokenInput.value
    }, () => {
      alert('Settings saved!');
      chrome.runtime.sendMessage({ type: 'settings-updated' });
    });
  };

  document.getElementById('export-pr-list').onclick = () => {
    chrome.storage.sync.get({ prPages: [] }, (data) => {
      const blob = new Blob([JSON.stringify(data.prPages)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pr-pages.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  document.getElementById('import-pr-list').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const prPages = JSON.parse(evt.target.result);
          if (Array.isArray(prPages)) {
            chrome.storage.sync.set({ prPages }, () => alert('PR list imported!'));
          }
        } catch {
          alert('Invalid file!');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  document.getElementById('generate-ms-teams').onclick = () => {
    chrome.storage.sync.get({ prPages: [] }, (data) => {
      const message = data.prPages.map(url => `- ${url}`).join('\n');
      navigator.clipboard.writeText(`GitHub PRs to review:\n${message}`);
      alert('MS Teams message copied to clipboard!');
    });
  };

  // Show notification history if enabled
  function loadNotificationHistory() {
    chrome.storage.sync.get({ showHistory: false }, (settings) => {
      if (!settings.showHistory) {
        document.getElementById('notification-history-section').style.display = 'none';
        return;
      }
      document.getElementById('notification-history-section').style.display = '';
      chrome.storage.local.get({ notificationHistory: [] }, (data) => {
        const list = document.getElementById('notification-history-list');
        list.innerHTML = '';
        data.notificationHistory.slice(-50).reverse().forEach(item => {
          const li = document.createElement('li');
          li.innerHTML = `<a href="${item.prUrl}" target="_blank">${item.prTitle}</a> [${item.type}] <small>${new Date(item.time).toLocaleString()}</small>`;
          list.appendChild(li);
        });
      });
    });
  }

  // Call on load and when settings change
  loadNotificationHistory();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' || area === 'sync') loadNotificationHistory();
  });
});
