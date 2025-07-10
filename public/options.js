// Handles settings/options for PR Manager
// Loads and saves settings, handles export/import, MS Teams message generation

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  const statusText = document.getElementById('status-text');
  
  statusEl.className = `notification ${type}`;
  statusText.textContent = message;
  statusEl.classList.remove('hidden');
  
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const intervalInput = document.getElementById('interval');
  const workingHoursInput = document.getElementById('working-hours');
  const showHistoryInput = document.getElementById('show-history');
  const customMessageInput = document.getElementById('custom-message');
  const githubTokenInput = document.getElementById('github-token');

  // Load existing settings
  chrome.storage.sync.get({
    interval: 60,
    workingHours: '09:00-18:00',
    showHistory: false,
    customMessage: '',
    githubToken: '',
    repositories: [] // New structure for repositories with tracked users
  }, (data) => {
    intervalInput.value = data.interval;
    workingHoursInput.value = data.workingHours;
    showHistoryInput.checked = data.showHistory;
    customMessageInput.value = data.customMessage;
    githubTokenInput.value = data.githubToken;
    
    // Load repositories
    loadRepositories(data.repositories);
    
    // Update notification history visibility
    loadNotificationHistory();
  });

  // Save settings
  form.onsubmit = (e) => {
    e.preventDefault();
    
    const settings = {
      interval: Number(intervalInput.value),
      workingHours: workingHoursInput.value,
      showHistory: showHistoryInput.checked,
      customMessage: customMessageInput.value,
      githubToken: githubTokenInput.value
    };
    
    chrome.storage.sync.set(settings, () => {
      showStatus('Settings saved successfully! ✅', 'success');
      chrome.runtime.sendMessage({ type: 'settings-updated' });
      loadNotificationHistory(); // Refresh history visibility
    });
  };

  // Export PR list
  document.getElementById('export-pr-list').onclick = () => {
    chrome.storage.sync.get({ prPages: [] }, (data) => {
      const exportData = {
        prPages: data.prPages,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pr-manager-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      showStatus('PR list exported successfully! 📤', 'success');
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

  // Generate Teams message with improved formatting
  async function generateTeamsMessage() {
    const data = await new Promise(resolve => {
      chrome.storage.sync.get({ repositories: [], githubToken: '' }, resolve);
    });
    
    if (!data.githubToken) {
      throw new Error('Please add your GitHub token first!');
    }
    
    if (!data.repositories || data.repositories.length === 0) {
      throw new Error('No repositories added yet!');
    }
    
    let teamsMessage = '📋 **GitHub PRs to Review:**\n\n';
    let repoCounter = 1;
    let totalPRs = 0;
    
    for (const repo of data.repositories) {
      const match = repo.url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
      if (!match) continue;
      
      const [_, owner, repoName] = match;
      const displayName = `${owner}/${repoName}`;
      
      // Fetch open PRs for this repository
      const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=100`, {
        headers: { Authorization: `token ${data.githubToken}` }
      });
      
      if (!response.ok) {
        console.warn(`Failed to fetch PRs for ${displayName}:`, response.status);
        continue;
      }
      
      const allPRs = await response.json();
      
      // Filter PRs by tracked users (if any are specified)
      let filteredPRs = allPRs;
      if (repo.trackedUsers && repo.trackedUsers.length > 0) {
        filteredPRs = allPRs.filter(pr => 
          repo.trackedUsers.includes(pr.user.login)
        );
      }
      
      if (filteredPRs.length > 0) {
        const userFilter = repo.trackedUsers.length > 0 ? 
          ` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
        
        teamsMessage += `**${repoCounter}. ${displayName}** (${filteredPRs.length} PRs${userFilter})\n`;
        filteredPRs.forEach(pr => {
          const author = pr.user.login;
          const createdDate = new Date(pr.created_at).toLocaleDateString();
          teamsMessage += `   - [${pr.title}](${pr.html_url}) by @${author} (${createdDate})\n`;
        });
        teamsMessage += '\n';
        repoCounter++;
        totalPRs += filteredPRs.length;
      }
    }
    
    if (repoCounter === 1) {
      teamsMessage += '✅ **No open PRs found for tracked users in any repository!**';
    } else {
      teamsMessage = `📋 **GitHub PRs to Review (${totalPRs} total):**\n\n` + teamsMessage.substring(teamsMessage.indexOf('\n\n') + 2);
    }
    
    return teamsMessage;
  }

  // Preview Teams message
  document.getElementById('preview-teams-message').onclick = async () => {
    showStatus('Generating preview... 🔄', 'info');
    
    try {
      const teamsMessage = await generateTeamsMessage();
      document.getElementById('teams-preview-content').textContent = teamsMessage;
      document.getElementById('teams-preview-section').classList.remove('hidden');
      showStatus('Preview generated! 👀', 'success');
    } catch (error) {
      showStatus(error.message + ' ❌', 'error');
    }
  };

  // Copy preview to clipboard
  document.getElementById('copy-preview').onclick = async () => {
    const previewContent = document.getElementById('teams-preview-content').textContent;
    if (!previewContent || previewContent.includes('Click')) {
      showStatus('No preview to copy! Generate a preview first. 📋', 'warning');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(previewContent);
      showStatus('Teams message copied to clipboard! 📋✅', 'success');
    } catch (error) {
      showStatus('Failed to copy to clipboard! 📋❌', 'error');
    }
  };

  // Generate and copy Teams message directly
  document.getElementById('generate-ms-teams').onclick = async () => {
    showStatus('Generating Teams message... 🔄', 'info');
    
    try {
      const teamsMessage = await generateTeamsMessage();
      await navigator.clipboard.writeText(teamsMessage);
      showStatus('Teams message copied to clipboard! 📋✅', 'success');
      
      // Also update preview if it's visible
      if (!document.getElementById('teams-preview-section').classList.contains('hidden')) {
        document.getElementById('teams-preview-content').textContent = teamsMessage;
      }
    } catch (error) {
      showStatus(error.message + ' ❌', 'error');
    }
  };

  // Repository management functions
  function loadRepositories(repositories) {
    const repositoryList = document.getElementById('repository-list');
    repositoryList.innerHTML = '';
    
    if (!repositories || repositories.length === 0) {
      repositoryList.innerHTML = `
        <div class="repository-empty">
          <p>No repositories added yet.</p>
          <p>Click "Add Repository" to start tracking PRs for specific users.</p>
        </div>
      `;
      return;
    }
    
    repositories.forEach((repo, index) => {
      const repoElement = createRepositoryElement(repo, index);
      repositoryList.appendChild(repoElement);
    });
  }
  
  function createRepositoryElement(repo, index) {
    const div = document.createElement('div');
    div.className = 'repository-item';
    div.setAttribute('data-index', index);
    
    const repoName = repo.url.match(/github\.com\/(.+?)\/(.+?)\/pulls/);
    const displayName = repoName ? `${repoName[1]}/${repoName[2]}` : repo.url;
    
    div.innerHTML = `
      <div class="repository-header">
        <div>
          <h3 class="repository-title">📁 ${displayName}</h3>
          <p class="repository-url">${repo.url}</p>
        </div>
        <div class="repository-controls">
          <button class="remove-repository danger" data-index="${index}">
            <span>🗑️</span>
            Remove
          </button>
        </div>
      </div>
      
      <div class="tracked-users-section">
        <div class="tracked-users-header">
          <h4>👥 Tracked Users (${repo.trackedUsers.length})</h4>
        </div>
        <div class="user-tags" id="user-tags-${index}">
          ${repo.trackedUsers.map(user => `
            <span class="user-tag">
              @${user}
              <button class="remove-user" data-repo="${index}" data-user="${user}">✕</button>
            </span>
          `).join('')}
        </div>
        <div class="add-user-input">
          <input type="text" placeholder="GitHub username" id="user-input-${index}" />
          <button class="add-user secondary" data-index="${index}">
            <span>➕</span>
            Add User
          </button>
        </div>
      </div>
    `;
    
    return div;
  }
  
  function saveRepositories() {
    chrome.storage.sync.get(['repositories'], (data) => {
      const repositories = data.repositories || [];
      chrome.storage.sync.set({ repositories }, () => {
        showStatus('Repository settings saved! 📁', 'success');
      });
    });
  }
  
  // Add repository functionality
  document.getElementById('add-repository').onclick = () => {
    const url = prompt('Enter GitHub PR listing page URL:\n(e.g., https://github.com/owner/repo/pulls)');
    if (url && url.startsWith('https://github.com/') && url.includes('/pulls')) {
      chrome.storage.sync.get(['repositories'], (data) => {
        const repositories = data.repositories || [];
        
        // Check if repository already exists
        const exists = repositories.some(repo => repo.url === url);
        if (exists) {
          showStatus('This repository is already added! 📋', 'warning');
          return;
        }
        
        // Add new repository
        repositories.push({
          url: url,
          trackedUsers: []
        });
        
        chrome.storage.sync.set({ repositories }, () => {
          loadRepositories(repositories);
          showStatus('Repository added successfully! 🎉', 'success');
        });
      });
    } else if (url) {
      showStatus('Please enter a valid GitHub PR page URL 🔗', 'error');
    }
  };
  
  // Handle repository list interactions
  document.getElementById('repository-list').onclick = (e) => {
    const target = e.target;
    
    // Remove repository
    if (target.classList.contains('remove-repository') || target.parentElement.classList.contains('remove-repository')) {
      const button = target.classList.contains('remove-repository') ? target : target.parentElement;
      const index = parseInt(button.getAttribute('data-index'));
      
      if (confirm('Are you sure you want to remove this repository?')) {
        chrome.storage.sync.get(['repositories'], (data) => {
          const repositories = data.repositories || [];
          repositories.splice(index, 1);
          chrome.storage.sync.set({ repositories }, () => {
            loadRepositories(repositories);
            showStatus('Repository removed! 🗑️', 'info');
          });
        });
      }
    }
    
    // Remove user
    if (target.classList.contains('remove-user')) {
      const repoIndex = parseInt(target.getAttribute('data-repo'));
      const username = target.getAttribute('data-user');
      
      chrome.storage.sync.get(['repositories'], (data) => {
        const repositories = data.repositories || [];
        if (repositories[repoIndex]) {
          repositories[repoIndex].trackedUsers = repositories[repoIndex].trackedUsers.filter(user => user !== username);
          chrome.storage.sync.set({ repositories }, () => {
            loadRepositories(repositories);
            showStatus(`User @${username} removed from tracking! 👤`, 'info');
          });
        }
      });
    }
    
    // Add user
    if (target.classList.contains('add-user') || target.parentElement.classList.contains('add-user')) {
      const button = target.classList.contains('add-user') ? target : target.parentElement;
      const index = parseInt(button.getAttribute('data-index'));
      const input = document.getElementById(`user-input-${index}`);
      const username = input.value.trim().replace('@', '');
      
      if (!username) {
        showStatus('Please enter a username! 👤', 'warning');
        return;
      }
      
      chrome.storage.sync.get(['repositories'], (data) => {
        const repositories = data.repositories || [];
        if (repositories[index]) {
          if (repositories[index].trackedUsers.includes(username)) {
            showStatus(`User @${username} is already being tracked! 👤`, 'warning');
            return;
          }
          
          repositories[index].trackedUsers.push(username);
          chrome.storage.sync.set({ repositories }, () => {
            loadRepositories(repositories);
            showStatus(`User @${username} added to tracking! 👤`, 'success');
          });
        }
      });
    }
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
