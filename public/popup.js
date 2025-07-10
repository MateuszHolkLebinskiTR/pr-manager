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
        <span>No PR pages added yet. Click "Add PR Page" to get started! 🚀</span>
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
      const url = prPages[idx];
      let pendingCount = 0;
      
      if (user && settings.githubToken) {
        const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
        if (match) {
          const [_, owner, repo] = match;
          try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
              headers: { Authorization: `token ${settings.githubToken}` }
            });
            if (res.ok) {
              const prs = await res.json();
              pendingCount = prs.filter(pr => 
                pr.requested_reviewers && 
                pr.requested_reviewers.some(r => r.login === user.login)
              ).length;
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
      
      div.innerHTML = `
        <span class="flex items-center gap-2">
          <a href="${url}" target="_blank" title="${url}">
            📁 ${displayName}
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
  chrome.storage.sync.get({ prPages: [] }, (data) => {
    renderPRList(data.prPages);
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
});
