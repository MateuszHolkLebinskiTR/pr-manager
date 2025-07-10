// Handles popup UI for PR Manager
// Loads PR pages, allows adding/removing, and opens settings

function showStatus(message, type = 'info') {
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

function renderPRList(prPages) {
  const prListDiv = document.getElementById('pr-list');
  prListDiv.innerHTML = '';
  
  if (!prPages.length) {
    prListDiv.innerHTML = `
      <div class="pr-page-item empty text-center">
        <span>No repositories added yet. Go to Settings to add repositories! 🚀</span>
      </div>
    `;
    return;
  }
  
  chrome.storage.sync.get({ githubToken: '', filterByApprovals: false, filterByMyApproval: false }, async (settings) => {
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
              
              // Apply advanced filtering only if enabled in settings
              let prsNeedingReview = filteredPRs;
              if (settings.filterByApprovals || settings.filterByMyApproval) {
                prsNeedingReview = [];
                for (const pr of filteredPRs) {
                  try {
                    const reviewsRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${pr.number}/reviews`, {
                      headers: { Authorization: `token ${settings.githubToken}` }
                    });
                    if (reviewsRes.ok) {
                      const reviews = await reviewsRes.json();
                      
                      // Count total approvals
                      const approvals = reviews.filter(review => review.state === 'APPROVED');
                      pr.approvals = approvals.length;
                      
                      // Check if current user has approved
                      const userHasApproved = approvals.some(review => 
                        review.user.login === user.login
                      );
                      
                      // Apply filtering based on settings
                      let includeThisPR = true;
                      
                      if (settings.filterByApprovals && pr.approvals >= 3) {
                        includeThisPR = false; // Exclude PRs with 3+ approvals
                      }
                      
                      if (settings.filterByMyApproval && userHasApproved) {
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
              
              pendingCount = prsNeedingReview.length;
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
        <span class="d-flex align-items-center">
          <a href="${url}" target="_blank" title="${url}" class="text-decoration-none mr-2">
            📁 ${displayName}${userFilter}
          </a>
          ${pendingCount > 0 ? `<span class="pr-pending-count">${pendingCount}</span>` : ''}
        </span>
        <button data-idx="${idx}" class="btn btn-outline-danger btn-sm remove-pr-page">
          🗑️
        </button>
      `;
      prListDiv.appendChild(div);
    }
  });
}

function loadPRPages() {
  console.log('Loading PR pages...');
  try {
    chrome.storage.sync.get({ repositories: [] }, (data) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        showStatus('Failed to load repositories', 'error');
        return;
      }
      console.log('Loaded repositories:', data.repositories);
      renderPRList(data.repositories);
    });
  } catch (error) {
    console.error('Failed to load PR pages:', error);
    showStatus('Failed to load repositories', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  
  // Check if Chrome extension APIs are available
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.error('Chrome extension APIs not available');
    showStatus('Extension APIs not available. Please reload the extension.', 'error');
    return;
  }
  
  loadPRPages();

  // Settings button
  const settingsBtn = document.getElementById('open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      console.log('Settings button clicked');
      try {
        chrome.runtime.openOptionsPage();
      } catch (error) {
        console.error('Failed to open settings:', error);
        showStatus('Failed to open settings page', 'error');
      }
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refresh-list');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('Refresh button clicked');
      loadPRPages();
      showStatus('List refreshed! 🔄', 'info');
    });
  }

  // Check Now button
  const checkBtn = document.getElementById('check-now');
  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      console.log('Check Now button clicked');
      showStatus('Checking for PRs... 🔍', 'info');
      try {
        chrome.runtime.sendMessage({ type: 'check-now' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            showStatus('Failed to check PRs. Please try again.', 'error');
          } else if (response && response.success) {
            showStatus('PR check completed! 📋', 'success');
          } else {
            showStatus('Check failed. Please verify your settings. ⚠️', 'error');
          }
        });
      } catch (error) {
        console.error('Failed to send message:', error);
        showStatus('Failed to check PRs. Please try again.', 'error');
      }
    });
  }

  // Remove PR page functionality (event delegation)
  document.getElementById('pr-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-pr-page') || e.target.parentElement.classList.contains('remove-pr-page')) {
      const button = e.target.classList.contains('remove-pr-page') ? e.target : e.target.parentElement;
      const idx = parseInt(button.getAttribute('data-idx'), 10);
      
      if (confirm('Are you sure you want to remove this repository?')) {
        chrome.storage.sync.get({ repositories: [] }, (data) => {
          const updated = data.repositories.filter((_, i) => i !== idx);
          chrome.storage.sync.set({ repositories: updated }, () => {
            loadPRPages();
            showStatus('Repository removed 🗑️', 'info');
          });
        });
      }
    }
  });

  // Generate PR overview (same as Teams message)
  async function generatePROverview() {
    const data = await new Promise(resolve => {
      chrome.storage.sync.get({ repositories: [], githubToken: '', filterByApprovals: false, filterByMyApproval: false }, resolve);
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
      if (data.filterByApprovals || data.filterByMyApproval) {
        prsNeedingReview = [];
        for (const pr of filteredPRs) {
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
              let includeThisPR = true;
              
              if (data.filterByApprovals && pr.approvals >= 3) {
                includeThisPR = false; // Exclude PRs with 3+ approvals
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
          
          // Show approval status
          const approvalStatus = pr.approvals !== undefined ? ` (${pr.approvals}/3 ✅)` : '';
          
          html += `<div class="pr-item">`;
          html += `<div class="pr-title">• <a href="${pr.html_url}" target="_blank" title="${pr.title}">${title}</a>${approvalStatus}</div>`;
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
        const approvalStatus = pr.approvals !== undefined ? ` (${pr.approvals}/3 approvals)` : '';
        plainText += `   - ${pr.title}${approvalStatus}\n     by @${author} (${createdDate})\n     ${pr.html_url}\n\n`;
      });
      plainText += '\n';
    });
    
    return plainText;
  }

  // Show PR Overview button
  const showOverviewBtn = document.getElementById('show-pr-overview');
  if (showOverviewBtn) {
    showOverviewBtn.addEventListener('click', async () => {
      console.log('Show PR Overview button clicked');
      showStatus('Loading PR overview... 🔄', 'info');
      
      try {
        const { overviewData, totalPRs } = await generatePROverview();
        const htmlContent = renderPROverview(overviewData, totalPRs);
        
        // Store data for clipboard copy
        const plainTextContent = generatePlainTextOverview(overviewData, totalPRs);
        const contentEl = document.getElementById('pr-overview-content');
        if (contentEl) {
          contentEl.setAttribute('data-plain-text', plainTextContent);
          contentEl.innerHTML = htmlContent;
        }
        
        const sectionEl = document.getElementById('pr-overview-section');
        if (sectionEl) {
          sectionEl.style.display = 'block';
        }
        
        showStatus('PR overview loaded! 📋', 'success');
      } catch (error) {
        console.error('Failed to load PR overview:', error);
        showStatus(error.message + ' ❌', 'error');
      }
    });
  }

  // Close PR Overview button
  const closeOverviewBtn = document.getElementById('close-pr-overview');
  if (closeOverviewBtn) {
    closeOverviewBtn.addEventListener('click', () => {
      console.log('Close PR Overview button clicked');
      const sectionEl = document.getElementById('pr-overview-section');
      if (sectionEl) {
        sectionEl.style.display = 'none';
      }
    });
  }

  // Copy PR Overview to clipboard
  const copyOverviewBtn = document.getElementById('copy-pr-overview');
  if (copyOverviewBtn) {
    copyOverviewBtn.addEventListener('click', async () => {
      console.log('Copy PR Overview button clicked');
      const overviewElement = document.getElementById('pr-overview-content');
      if (!overviewElement) {
        showStatus('Overview content not found!', 'error');
        return;
      }
      
      const plainTextContent = overviewElement.getAttribute('data-plain-text');
      
      if (!plainTextContent || plainTextContent.includes('Click')) {
        showStatus('No overview to copy! Generate overview first. 📋', 'warning');
        return;
      }
      
      try {
        await navigator.clipboard.writeText(plainTextContent);
        showStatus('PR overview copied to clipboard! 📋✅', 'success');
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        showStatus('Failed to copy to clipboard! 📋❌', 'error');
      }
    });
  }
});
