// Handles popup UI for PR Manager
// Loads PR pages, allows adding/removing, and opens settings

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

function renderPRList(prPages) {
  const prListDiv = document.getElementById('pr-list');
  prListDiv.innerHTML = '';
  
  if (!prPages.length) {
    prListDiv.innerHTML = `
      <div class="pr-page-item empty">
        <span>No repositories added yet. Go to Settings to add repositories! 🚀</span>
      </div>
    `;
    return;
  }
  
  chrome.storage.sync.get({ githubToken: '' }, async (settings) => {
    let user = null;
    if (settings.githubToken) {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${settings.githubToken}` }
        });
        user = await res.json();
      } catch (e) {
        console.warn('Failed to fetch GitHub user:', e);
      }
    }
    
    for (let idx = 0; idx < prPages.length; idx++) {
      const repo = prPages[idx];
      const url = repo.url || repo; // Handle both old and new format
      let pendingCount = 0;
      
      if (user && settings.githubToken) {
        const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
        if (match) {
          const [_, owner, repoName] = match;
          try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=open`, {
              headers: { Authorization: `token ${settings.githubToken}` }
            });
            if (res.ok) {
              const allPRs = await res.json();
              
              // Filter by tracked users if specified
              let filteredPRs = allPRs;
              if (repo.trackedUsers && repo.trackedUsers.length > 0) {
                filteredPRs = allPRs.filter(pr => 
                  repo.trackedUsers.includes(pr.user.login)
                );
              }
              
              pendingCount = filteredPRs.length;
            }
          } catch (e) {
            console.warn('Failed to fetch PR data:', e);
          }
        }
      }
      
      const div = document.createElement('div');
      div.className = 'pr-page-item';
      
      const repoName = url.match(/github\.com\/(.+?)\/(.+?)\/pulls/);
      const displayName = repoName ? `${repoName[1]}/${repoName[2]}` : url;
      
      const userFilter = repo.trackedUsers && repo.trackedUsers.length > 0 ? 
        ` [${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
      
      div.innerHTML = `
        <span class="flex items-center gap-2">
          <a href="${url}" target="_blank" title="${url}">
            📁 ${displayName}${userFilter}
          </a>
          ${pendingCount > 0 ? `<span class="pr-pending-count">${pendingCount}</span>` : ''}
        </span>
        <button data-idx="${idx}" class="remove-pr-page danger">
          <span>🗑️</span>
        </button>
      `;
      prListDiv.appendChild(div);
    }
  });
}

function loadPRPages() {
  chrome.storage.sync.get({ repositories: [] }, (data) => {
    renderPRList(data.repositories);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPRPages();

  // Add PR page functionality
  document.getElementById('add-pr-page').onclick = () => {
    const url = prompt('Enter GitHub PR listing page URL:\n(e.g., https://github.com/owner/repo/pulls)');
    if (url && url.startsWith('https://github.com/')) {
      chrome.storage.sync.get({ prPages: [] }, (data) => {
        if (!data.prPages.includes(url)) {
          const updated = [...data.prPages, url];
          chrome.storage.sync.set({ prPages: updated }, () => {
            loadPRPages();
            showStatus('PR page added successfully! 🎉', 'success');
          });
        } else {
          showStatus('This PR page is already in your list 📋', 'warning');
        }
      });
    } else if (url) {
      showStatus('Please enter a valid GitHub PR page URL 🔗', 'error');
    }
  };

  // Remove PR page functionality
  document.getElementById('pr-list').onclick = (e) => {
    if (e.target.classList.contains('remove-pr-page') || e.target.parentElement.classList.contains('remove-pr-page')) {
      const button = e.target.classList.contains('remove-pr-page') ? e.target : e.target.parentElement;
      const idx = parseInt(button.getAttribute('data-idx'), 10);
      
      if (confirm('Are you sure you want to remove this PR page?')) {
        chrome.storage.sync.get({ prPages: [] }, (data) => {
          const updated = data.prPages.filter((_, i) => i !== idx);
          chrome.storage.sync.set({ prPages: updated }, () => {
            loadPRPages();
            showStatus('PR page removed 🗑️', 'info');
          });
        });
      }
    }
  };

  // Settings button
  document.getElementById('open-settings').onclick = () => {
    chrome.runtime.openOptionsPage();
  };

  // Refresh button
  document.getElementById('refresh-list').onclick = () => {
    loadPRPages();
    showStatus('List refreshed! 🔄', 'info');
  };

  // Check Now button
  document.getElementById('check-now').onclick = () => {
    showStatus('Checking for PRs... 🔍', 'info');
    chrome.runtime.sendMessage({ type: 'check-now' }, (response) => {
      if (response && response.success) {
        showStatus('PR check completed! 📋', 'success');
      } else {
        showStatus('Check failed. Please verify your settings. ⚠️', 'error');
      }
    });
  };

  // Generate PR overview (same as Teams message)
  async function generatePROverview() {
    const data = await new Promise(resolve => {
      chrome.storage.sync.get({ repositories: [], githubToken: '' }, resolve);
    });
    
    if (!data.githubToken) {
      throw new Error('Please add your GitHub token in settings first!');
    }
    
    if (!data.repositories || data.repositories.length === 0) {
      throw new Error('No repositories added yet!');
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
      
      if (filteredPRs.length > 0) {
        overviewData.push({
          repoName: displayName,
          prs: filteredPRs,
          trackedUsers: repo.trackedUsers || []
        });
        totalPRs += filteredPRs.length;
      }
    }
    
    return { overviewData, totalPRs };
  }

  // Render PR overview as HTML with clickable links
  function renderPROverview(overviewData, totalPRs) {
    let html = '';
    
    if (overviewData.length === 0) {
      html = '<div class="text-center" style="color: var(--text-secondary); font-style: italic;">✅ No open PRs found for tracked users in any repository!</div>';
    } else {
      html = `<div class="pr-overview-header">📋 <strong>GitHub PRs to Review (${totalPRs} total):</strong></div><br>`;
      
      overviewData.forEach((repo, index) => {
        const userFilter = repo.trackedUsers.length > 0 ? 
          ` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
        
        html += `<div class="repo-section">`;
        html += `<div class="repo-title"><strong>${index + 1}. ${repo.repoName}</strong> (${repo.prs.length} PRs${userFilter})</div>`;
        
        repo.prs.forEach(pr => {
          const author = pr.user.login;
          const createdDate = new Date(pr.created_at).toLocaleDateString();
          // Truncate long PR titles for popup display
          const title = pr.title.length > 50 ? pr.title.substring(0, 50) + '...' : pr.title;
          
          html += `<div class="pr-item">`;
          html += `<div class="pr-title">• <a href="${pr.html_url}" target="_blank" title="${pr.title}">${title}</a></div>`;
          html += `<div class="pr-meta">by @${author} (${createdDate})</div>`;
          html += `</div>`;
        });
        
        html += `</div><br>`;
      });
    }
    
    return html;
  }

  // Generate plain text version for clipboard (same as Teams message)
  function generatePlainTextOverview(overviewData, totalPRs) {
    if (overviewData.length === 0) {
      return '✅ No open PRs found for tracked users in any repository!';
    }
    
    let plainText = `📋 GitHub PRs to Review (${totalPRs} total):\n\n`;
    
    overviewData.forEach((repo, index) => {
      const userFilter = repo.trackedUsers.length > 0 ? 
        ` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
      
      plainText += `${index + 1}. ${repo.repoName} (${repo.prs.length} PRs${userFilter})\n`;
      repo.prs.forEach(pr => {
        const author = pr.user.login;
        const createdDate = new Date(pr.created_at).toLocaleDateString();
        plainText += `   - ${pr.title}\n     by @${author} (${createdDate})\n     ${pr.html_url}\n\n`;
      });
      plainText += '\n';
    });
    
    return plainText;
  }

  // Show PR Overview button
  document.getElementById('show-pr-overview').onclick = async () => {
    showStatus('Loading PR overview... 🔄', 'info');
    
    try {
      const { overviewData, totalPRs } = await generatePROverview();
      const htmlContent = renderPROverview(overviewData, totalPRs);
      
      // Store data for clipboard copy
      const plainTextContent = generatePlainTextOverview(overviewData, totalPRs);
      document.getElementById('pr-overview-content').setAttribute('data-plain-text', plainTextContent);
      
      // Display HTML content with clickable links
      document.getElementById('pr-overview-content').innerHTML = htmlContent;
      document.getElementById('pr-overview-section').classList.remove('hidden');
      showStatus('PR overview loaded! 📋', 'success');
    } catch (error) {
      showStatus(error.message + ' ❌', 'error');
    }
  };

  // Close PR Overview button
  document.getElementById('close-pr-overview').onclick = () => {
    document.getElementById('pr-overview-section').classList.add('hidden');
  };

  // Copy PR Overview to clipboard
  document.getElementById('copy-pr-overview').onclick = async () => {
    const overviewElement = document.getElementById('pr-overview-content');
    const plainTextContent = overviewElement.getAttribute('data-plain-text');
    
    if (!plainTextContent || plainTextContent.includes('Click')) {
      showStatus('No overview to copy! Generate overview first. 📋', 'warning');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(plainTextContent);
      showStatus('PR overview copied to clipboard! 📋✅', 'success');
    } catch (error) {
      showStatus('Failed to copy to clipboard! 📋❌', 'error');
    }
  };
});
