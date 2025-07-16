// Handles settings/options for PR Manager
// Loads and saves settings, handles export/import, MS Teams message generation

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  const statusText = document.getElementById('status-text');
  
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
  const form = document.getElementById('settings-form');
  const intervalInput = document.getElementById('interval');
  const workingHoursInput = document.getElementById('working-hours');
  const showHistoryInput = document.getElementById('show-history');
  const customMessageInput = document.getElementById('custom-message');
  const githubTokenInput = document.getElementById('github-token');
  const filterByApprovalsInput = document.getElementById('filter-by-approvals');
  const filterByMyApprovalInput = document.getElementById('filter-by-my-approval');
  const filterByWipInput = document.getElementById('filter-by-wip');
  const teamsWebhookUrlInput = document.getElementById('teams-webhook-url');
  const teamsSenderNameInput = document.getElementById('teams-sender-name');

  // Load existing settings
  chrome.storage.sync.get({
    interval: 60,
    workingHours: '09:00-18:00',
    showHistory: false,
    customMessage: '',
    githubToken: '',
    repositories: [], // New structure for repositories with tracked users
    filterByApprovals: false,
    filterByMyApproval: false,
    filterByWip: false,
    teamsWebhookUrl: '',
    teamsSenderName: 'PR Manager Bot'
  }, (data) => {
    intervalInput.value = data.interval;
    workingHoursInput.value = data.workingHours;
    showHistoryInput.checked = data.showHistory;
    customMessageInput.value = data.customMessage;
    githubTokenInput.value = data.githubToken;
    filterByApprovalsInput.checked = data.filterByApprovals;
    filterByMyApprovalInput.checked = data.filterByMyApproval;
    filterByWipInput.checked = data.filterByWip;
    teamsWebhookUrlInput.value = data.teamsWebhookUrl;
    teamsSenderNameInput.value = data.teamsSenderName;
    
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
      githubToken: githubTokenInput.value,
      filterByApprovals: filterByApprovalsInput.checked,
      filterByMyApproval: filterByMyApprovalInput.checked,
      filterByWip: filterByWipInput.checked,
      teamsWebhookUrl: teamsWebhookUrlInput.value,
      teamsSenderName: teamsSenderNameInput.value
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
      chrome.storage.sync.get({ 
        repositories: [], 
        githubToken: '', 
        filterByApprovals: false, 
        filterByMyApproval: false, 
        filterByWip: false 
      }, resolve);
    });
    
    if (!data.githubToken) {
      throw new Error('Please add your GitHub token first!');
    }
    
    if (!data.repositories || data.repositories.length === 0) {
      throw new Error('No repositories added yet!');
    }
    
    // Get current user info for approval filtering
    let user = null;
    if (data.filterByApprovals || data.filterByMyApproval) {
      try {
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${data.githubToken}` }
        });
        user = await userRes.json();
      } catch (e) {
        console.warn('Failed to fetch GitHub user:', e);
      }
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
      
      // Apply advanced filtering only if enabled in settings
      let prsNeedingReview = filteredPRs;
      if (data.filterByApprovals || data.filterByMyApproval || data.filterByWip) {
        prsNeedingReview = [];
        for (const pr of filteredPRs) {
          let includeThisPR = true;
          
          // Check WIP filter first (doesn't require API call)
          if (data.filterByWip) {
            const isWIP = pr.title.toLowerCase().includes('wip') || 
                          pr.title.toLowerCase().includes('work in progress') ||
                          pr.draft === true;
            if (isWIP) {
              includeThisPR = false;
            }
          }
          
          // Skip API call if already filtered out by WIP
          if (!includeThisPR) {
            continue;
          }
          
          // Apply approval filters (requires API calls)
          if (data.filterByApprovals || data.filterByMyApproval) {
            try {
              const reviewsRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${pr.number}/reviews`, {
                headers: { Authorization: `token ${data.githubToken}` }
              });
              if (reviewsRes.ok) {
                const reviews = await reviewsRes.json();
                
                // Count total approvals
                const approvals = reviews.filter(review => review.state === 'APPROVED');
                pr.approvals = approvals.length;
                
                // Check if current user has approved
                const userHasApproved = user ? approvals.some(review => 
                  review.user.login === user.login
                ) : false;
                
                // Apply filtering based on settings
                if (data.filterByApprovals && pr.approvals >= 2) {
                  includeThisPR = false; // Exclude PRs with 2+ approvals
                }
                
                if (data.filterByMyApproval && userHasApproved) {
                  includeThisPR = false; // Exclude PRs already approved by user
                }
              }
            } catch (e) {
              console.warn('Failed to fetch reviews for PR', pr.number, e);
              // If we can't fetch reviews, include the PR to be safe
            }
          }
          
          if (includeThisPR) {
            prsNeedingReview.push(pr);
          }
        }
      }
      
      if (prsNeedingReview.length > 0) {
        const userFilter = ''//repo.trackedUsers.length > 0 ? 
          //` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
        
        teamsMessage += `**${repoCounter}. ${displayName}** (${prsNeedingReview.length} PRs${userFilter})\n`;
        prsNeedingReview.forEach(pr => {
          const author = pr.user.login;
          const createdDate = new Date(pr.created_at).toLocaleDateString();
          teamsMessage += `   - [${pr.title}](${pr.html_url}) by @${author} (${createdDate})\n`;
        });
        teamsMessage += '\n';
        repoCounter++;
        totalPRs += prsNeedingReview.length;
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
      document.getElementById('teams-preview-section').style.display = 'block';
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
      if (document.getElementById('teams-preview-section').style.display !== 'none') {
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
    div.className = 'card border-secondary mb-3';
    div.setAttribute('data-index', index);
    
    const repoName = repo.url.match(/github\.com\/(.+?)\/(.+?)\/pulls/);
    const displayName = repoName ? `${repoName[1]}/${repoName[2]}` : repo.url;
    
    div.innerHTML = `
      <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <div>
          <h5 class="card-title mb-1">📁 ${displayName}</h5>
          <p class="card-text text-muted small mb-0">${repo.url}</p>
        </div>
        <button class="btn btn-outline-danger btn-sm remove-repository" data-index="${index}">
          <span class="mr-2">🗑️</span>
          Remove
        </button>
      </div>
      
      <div class="card-body">
        <div class="mb-3">
          <h6 class="text-primary">👥 Tracked Users (${repo.trackedUsers.length})</h6>
          <div class="d-flex flex-wrap" id="user-tags-${index}">
            ${repo.trackedUsers.map(user => `
              <span class="badge badge-secondary mr-2 mb-2 d-flex align-items-center">
                @${user}
                <button class="btn btn-sm btn-link text-white p-0 ml-1 remove-user" data-repo="${index}" data-user="${user}" style="line-height: 1;">✕</button>
              </span>
            `).join('')}
          </div>
        </div>
        <div class="input-group">
          <input type="text" class="form-control" placeholder="GitHub username" id="user-input-${index}" />
          <div class="input-group-append">
            <button class="btn btn-outline-secondary add-user" data-index="${index}">
              <span class="mr-2">➕</span>
              Add User
            </button>
          </div>
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
          li.className = 'list-group-item d-flex justify-content-between align-items-center';
          li.innerHTML = `
            <div>
              <a href="${item.prUrl}" target="_blank" class="text-decoration-none">${item.prTitle}</a>
              <small class="text-muted d-block">${new Date(item.time).toLocaleString()}</small>
            </div>
            <span class="badge badge-${item.type === 'new' ? 'success' : 'info'} badge-pill">${item.type}</span>
          `;
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

  // Teams Webhook Integration
  
  // Generate PR overview function (copied from popup.js for Teams integration)
  async function generatePROverview() {
    const data = await new Promise(resolve => {
      chrome.storage.sync.get({ repositories: [], githubToken: '', filterByApprovals: false, filterByMyApproval: false, filterByWip: false }, resolve);
    });
    
    if (!data.githubToken) {
      throw new Error('Please add your GitHub token in settings first!');
    }
    
    if (!data.repositories || data.repositories.length === 0) {
      throw new Error('No repositories added yet!');
    }
    
    // Get current user info for approval filtering
    let user = null;
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${data.githubToken}` }
      });
      user = await userRes.json();
    } catch (e) {
      console.warn('Failed to fetch GitHub user:', e);
    }
    
    let overviewData = [];
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
      
      // Apply advanced filtering only if enabled in settings
      let prsNeedingReview = filteredPRs;
      if (data.filterByApprovals || data.filterByMyApproval || data.filterByWip) {
        prsNeedingReview = [];
        for (const pr of filteredPRs) {
          let includeThisPR = true;
          
          // Check WIP filter first (doesn't require API call)
          if (data.filterByWip) {
            const isWIP = pr.title.toLowerCase().includes('wip') || 
                          pr.title.toLowerCase().includes('work in progress') ||
                          pr.draft === true;
            if (isWIP) {
              includeThisPR = false;
            }
          }
          
          // Skip API call if already filtered out by WIP
          if (!includeThisPR) {
            continue;
          }
          
          try {
            const reviewsRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${pr.number}/reviews`, {
              headers: { Authorization: `token ${data.githubToken}` }
            });
            if (reviewsRes.ok) {
              const reviews = await reviewsRes.json();
              
              // Count total approvals
              const approvals = reviews.filter(review => review.state === 'APPROVED');
              pr.approvals = approvals.length;
              
              // Check if current user has approved
              const userHasApproved = user ? approvals.some(review => 
                review.user.login === user.login
              ) : false;
              
              // Apply filtering based on settings (continue from WIP check above)
              if (data.filterByApprovals && pr.approvals >= 2) {
                includeThisPR = false; // Exclude PRs with 2+ approvals
              }
              
              if (data.filterByMyApproval && userHasApproved) {
                includeThisPR = false; // Exclude PRs already approved by user
              }
              
              if (includeThisPR) {
                prsNeedingReview.push(pr);
              }
            }
          } catch (e) {
            console.warn('Failed to fetch reviews for PR', pr.number, e);
            // If we can't fetch reviews, include the PR to be safe
            prsNeedingReview.push(pr);
          }
        }
      }
      
      if (prsNeedingReview.length > 0) {
        overviewData.push({
          repoName: displayName,
          prs: prsNeedingReview,
          trackedUsers: repo.trackedUsers || []
        });
        totalPRs += prsNeedingReview.length;
      }
    }
    
    return { overviewData, totalPRs };
  }
  
  // Teams webhook functions
  
  // Test Teams webhook
  document.getElementById('test-teams-webhook')?.addEventListener('click', async () => {
    const webhookUrl = teamsWebhookUrlInput.value.trim();
    const senderName = teamsSenderNameInput.value || 'PR Manager Bot';
    
    if (!webhookUrl) {
      showStatus('Please enter a Teams webhook URL first', 'error');
      return;
    }
    
    // Validate webhook URL format
    if (!webhookUrl.startsWith('https://') || !webhookUrl.includes('webhook')) {
      showStatus('Please enter a valid Teams webhook URL (should start with https:// and contain "webhook")', 'error');
      return;
    }
    
    try {
      showStatus('Testing webhook connection...', 'info');
      console.log('Testing webhook URL:', webhookUrl);
      
      const testCard = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "PR Manager Test",
        "themeColor": "0076D7",
        "title": "🧪 PR Manager Test Message",
        "originator": senderName,
        "sections": [{
          "facts": [
            { "name": "Status", "value": "✅ Connection successful" },
            { "name": "Time", "value": new Date().toLocaleString() },
            { "name": "Extension", "value": "PR Manager v0.1.0" }
          ]
        }],
        "potentialAction": [{
          "@type": "OpenUri",
          "name": "View Extension Settings",
          "targets": [{ "os": "default", "uri": "chrome-extension://settings" }]
        }]
      };

      // Alternative simple format for Teams Workflows
      const simpleTest = {
        "text": "🧪 **PR Manager Test Message**\n\nYour Teams webhook is working correctly!\n\n" +
                "• **Status:** ✅ Connection successful\n" +
                `• **Time:** ${new Date().toLocaleString()}\n` +
                "• **Extension:** PR Manager v0.1.0\n\n" +
                `*Posted by ${senderName}*`
      };
      
      console.log('Sending test card:', testCard);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Try MessageCard format first, then simple text format
      let response;
      try {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PR-Manager-Extension/0.1.0'
          },
          body: JSON.stringify(testCard),
          signal: controller.signal
        });
        
        if (!response.ok) {
          console.log('MessageCard test failed, trying simple text format...');
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simpleTest),
            signal: controller.signal
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.log('MessageCard test error, trying simple text format...', error);
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simpleTest),
            signal: controller.signal
          });
        } else {
          throw error;
        }
      }
      
      clearTimeout(timeoutId);
      
      console.log('Webhook response status:', response.status);
      console.log('Webhook response headers:', [...response.headers.entries()]);
      
      if (response.ok) {
        showStatus('✅ Webhook test successful! Check your Teams channel.', 'success');
      } else {
        const responseText = await response.text();
        console.error('Webhook response error:', responseText);
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Webhook test error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out (check your network connection)';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - check your internet connection and webhook URL';
      } else if (error.message.includes('CORS')) {
        errorMessage = 'CORS error - webhook URL may be invalid or blocked';
      } else {
        errorMessage = error.message;
      }
      
      showStatus(`❌ Webhook test failed: ${errorMessage}`, 'error');
    }
  });

  // Post filtered PRs to Teams
  document.getElementById('post-to-teams')?.addEventListener('click', async () => {
    const webhookUrl = teamsWebhookUrlInput.value;
    const senderName = teamsSenderNameInput.value || 'PR Manager Bot';
    
    if (!webhookUrl) {
      showStatus('Please enter a Teams webhook URL first', 'error');
      return;
    }
    
    try {
      showStatus('Generating PR overview and posting to Teams...', 'info');
      
      // Generate the same PR overview data used elsewhere
      const { overviewData, totalPRs } = await generatePROverview();
      
      if (totalPRs === 0) {
        showStatus('No PRs found matching your current filters', 'warning');
        return;
      }
      
      // Generate content hash to check for changes
      const currentContentHash = generateContentHash(overviewData, totalPRs);
      
      // Check if content has changed since last post
      const { lastTeamsContentHash } = await new Promise(resolve => {
        chrome.storage.sync.get({ lastTeamsContentHash: null }, resolve);
      });
      
      if (lastTeamsContentHash === currentContentHash) {
        showStatus('⏭️ No changes detected since last Teams post - skipping to avoid spam', 'info');
        return;
      }
      
      // Create Teams Workflow-compatible payload
      // Support both traditional webhooks and Teams Workflows
      const teamsCard = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": `GitHub PRs to Review (${totalPRs} total)`,
        "themeColor": "0076D7",
        "title": `📋 GitHub PRs to Review (${totalPRs} total)`,
        "originator": senderName,
        "sections": [{
          "facts": []
        }]
      };
      
      // Add PR facts grouped by repository
      for (const repoData of overviewData) {
        teamsCard.sections[0].facts.push({
          "name": `📁 ${repoData.repoName}`,
          "value": `${repoData.prs.length} PRs`
        });
        
        for (const pr of repoData.prs.slice(0, 5)) { // Limit to 5 PRs per repo for Teams
          const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
          teamsCard.sections[0].facts.push({
            "name": `  ${pr.title.substring(0, 50)}${pr.title.length > 50 ? '...' : ''}`,
            "value": `by @${pr.user.login}${approvalText} - [View PR](${pr.html_url})`
          });
        }
        
        if (repoData.prs.length > 5) {
          teamsCard.sections[0].facts.push({
            "name": "  ...",
            "value": `and ${repoData.prs.length - 5} more PRs`
          });
        }
      }
      
      // Add action button
      teamsCard.potentialAction = [{
        "@type": "OpenUri",
        "name": "View on GitHub",
        "targets": [{ "os": "default", "uri": "https://github.com" }]
      }];

      // Create alternative simple text format for Teams Workflows
      const simplePayload = {
        "text": `📋 **GitHub PRs to Review (${totalPRs} total)**\n\n` +
               overviewData.map(repoData => 
                 `**📁 ${repoData.repoName}** (${repoData.prs.length} PRs)\n` +
                 repoData.prs.slice(0, 5).map(pr => {
                   const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
                   return `• [${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}](${pr.html_url}) by @${pr.user.login}${approvalText}`;
                 }).join('\n') +
                 (repoData.prs.length > 5 ? `\n• ...and ${repoData.prs.length - 5} more PRs` : '')
               ).join('\n\n') +
               `\n\n*Posted by ${senderName}*`
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Try MessageCard format first, then simple text format
      let response;
      try {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PR-Manager-Extension/0.1.0'
          },
          body: JSON.stringify(teamsCard),
          signal: controller.signal
        });
        
        if (!response.ok) {
          // If MessageCard fails, try simple text format
          console.log('MessageCard format failed, trying simple text format...');
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simplePayload),
            signal: controller.signal
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          // If first attempt fails, try simple format
          console.log('MessageCard format error, trying simple text format...', error);
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simplePayload),
            signal: controller.signal
          });
        } else {
          throw error;
        }
      }
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Save the content hash for future comparison
        chrome.storage.sync.set({ lastTeamsContentHash: currentContentHash }, () => {
          console.log('Saved Teams content hash for change detection');
        });
        
        showStatus(`🎉 Successfully posted ${totalPRs} PRs to Teams!`, 'success');
      } else {
        const responseText = await response.text();
        console.error('Teams posting response error:', responseText);
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Teams posting error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out (check your network connection)';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - check your internet connection and webhook URL';
      } else if (error.message.includes('Please add your GitHub token')) {
        errorMessage = 'GitHub token required - please add it in settings';
      } else if (error.message.includes('No repositories added')) {
        errorMessage = 'No repositories configured - please add repositories first';
      } else {
        errorMessage = error.message;
      }
      
      showStatus(`❌ Failed to post to Teams: ${errorMessage}`, 'error');
    }
  });
  
  // Force post to Teams (bypasses change detection)
  document.getElementById('force-post-to-teams')?.addEventListener('click', async () => {
    const webhookUrl = teamsWebhookUrlInput.value;
    const senderName = teamsSenderNameInput.value || 'PR Manager Bot';
    
    if (!webhookUrl) {
      showStatus('Please enter a Teams webhook URL first', 'error');
      return;
    }
    
    try {
      showStatus('Generating PR overview and force posting to Teams...', 'info');
      
      // Generate the same PR overview data used elsewhere
      const { overviewData, totalPRs } = await generatePROverview();
      
      if (totalPRs === 0) {
        showStatus('No PRs found matching your current filters', 'warning');
        return;
      }
      
      // Generate content hash (for saving after successful post)
      const currentContentHash = generateContentHash(overviewData, totalPRs);
      
      // Create Teams Workflow-compatible payload (same as regular post)
      const teamsCard = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": `GitHub PRs to Review (${totalPRs} total)`,
        "themeColor": "0076D7",
        "title": `📋 GitHub PRs to Review (${totalPRs} total)`,
        "originator": senderName,
        "sections": [{
          "facts": []
        }]
      };
      
      // Add PR facts grouped by repository
      for (const repoData of overviewData) {
        teamsCard.sections[0].facts.push({
          "name": `📁 ${repoData.repoName}`,
          "value": `${repoData.prs.length} PRs`
        });
        
        for (const pr of repoData.prs.slice(0, 5)) { // Limit to 5 PRs per repo for Teams
          const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
          teamsCard.sections[0].facts.push({
            "name": `  ${pr.title.substring(0, 50)}${pr.title.length > 50 ? '...' : ''}`,
            "value": `by @${pr.user.login}${approvalText} - [View PR](${pr.html_url})`
          });
        }
        
        if (repoData.prs.length > 5) {
          teamsCard.sections[0].facts.push({
            "name": "  ...",
            "value": `and ${repoData.prs.length - 5} more PRs`
          });
        }
      }
      
      // Add action button
      teamsCard.potentialAction = [{
        "@type": "OpenUri",
        "name": "View on GitHub",
        "targets": [{ "os": "default", "uri": "https://github.com" }]
      }];

      // Create alternative simple text format for Teams Workflows
      const simplePayload = {
        "text": `📋 **GitHub PRs to Review (${totalPRs} total)**\n\n` +
               overviewData.map(repoData => 
                 `**📁 ${repoData.repoName}** (${repoData.prs.length} PRs)\n` +
                 repoData.prs.slice(0, 5).map(pr => {
                   const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
                   return `• [${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}](${pr.html_url}) by @${pr.user.login}${approvalText}`;
                 }).join('\n') +
                 (repoData.prs.length > 5 ? `\n• ...and ${repoData.prs.length - 5} more PRs` : '')
               ).join('\n\n') +
               `\n\n*Posted by ${senderName}*`
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Try MessageCard format first, then simple text format
      let response;
      try {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PR-Manager-Extension/0.1.0'
          },
          body: JSON.stringify(teamsCard),
          signal: controller.signal
        });
        
        if (!response.ok) {
          console.log('MessageCard format failed, trying simple text format...');
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simplePayload),
            signal: controller.signal
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.log('MessageCard format error, trying simple text format...', error);
          response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'PR-Manager-Extension/0.1.0'
            },
            body: JSON.stringify(simplePayload),
            signal: controller.signal
          });
        } else {
          throw error;
        }
      }
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Save the content hash for future comparison
        chrome.storage.sync.set({ lastTeamsContentHash: currentContentHash }, () => {
          console.log('Saved Teams content hash for change detection');
        });
        
        showStatus(`🎉 Successfully force posted ${totalPRs} PRs to Teams!`, 'success');
      } else {
        const responseText = await response.text();
        console.error('Teams posting response error:', responseText);
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Teams force posting error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out (check your network connection)';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - check your internet connection and webhook URL';
      } else if (error.message.includes('Please add your GitHub token')) {
        errorMessage = 'GitHub token required - please add it in settings';
      } else if (error.message.includes('No repositories added')) {
        errorMessage = 'No repositories configured - please add repositories first';
      } else {
        errorMessage = error.message;
      }
      
      showStatus(`❌ Failed to force post to Teams: ${errorMessage}`, 'error');
    }
  });

  // Generate content hash for change detection
  function generateContentHash(overviewData, totalPRs) {
    const contentString = JSON.stringify({
      totalPRs,
      repos: overviewData.map(repo => ({
        name: repo.repoName,
        count: repo.prs.length,
        prs: repo.prs.map(pr => ({
          id: pr.id,
          title: pr.title,
          user: pr.user.login,
          approvals: pr.approvals,
          html_url: pr.html_url
        }))
      }))
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < contentString.length; i++) {
      const char = contentString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }
  
  // Clear Teams change history
  document.getElementById('clear-teams-history')?.addEventListener('click', async () => {
    chrome.storage.sync.remove('lastTeamsContentHash', () => {
      showStatus('✅ Teams change history cleared - next post will go through regardless of content', 'success');
      console.log('Cleared Teams content hash');
    });
  });
});
