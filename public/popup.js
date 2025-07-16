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
  
  chrome.storage.sync.get({ githubToken: '' }, async (settings) => {
    // Get current filter settings from popup checkboxes if available, otherwise from storage
    const popupFilterApprovals = document.getElementById('popup-filter-approvals');
    const popupFilterMyApproval = document.getElementById('popup-filter-my-approval');
    const popupFilterWip = document.getElementById('popup-filter-wip');
    
    const currentFilterSettings = await new Promise(resolve => {
      chrome.storage.sync.get({ filterByApprovals: false, filterByMyApproval: false, filterByWip: false }, (stored) => {
        resolve({
          filterByApprovals: popupFilterApprovals ? popupFilterApprovals.checked : stored.filterByApprovals,
          filterByMyApproval: popupFilterMyApproval ? popupFilterMyApproval.checked : stored.filterByMyApproval,
          filterByWip: popupFilterWip ? popupFilterWip.checked : stored.filterByWip
        });
      });
    });
    
    // Merge settings with current filter state
    const combinedSettings = { ...settings, ...currentFilterSettings };
    
    let user = null;
    if (combinedSettings.githubToken) {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${combinedSettings.githubToken}` }
        });
        user = await res.json();
      } catch (e) {
        console.warn('Failed to fetch GitHub user:', e);
      }
    }
    
    let totalBadgeCount = 0; // Track total for badge counter
    
    for (let idx = 0; idx < prPages.length; idx++) {
      const repo = prPages[idx];
      const url = repo.url || repo; // Handle both old and new format
      let pendingCount = 0;
      
      if (user && combinedSettings.githubToken) {
        const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
        if (match) {
          const [_, owner, repoName] = match;
          try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=open`, {
              headers: { Authorization: `token ${combinedSettings.githubToken}` }
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
              if (combinedSettings.filterByApprovals || combinedSettings.filterByMyApproval || combinedSettings.filterByWip) {
                prsNeedingReview = [];
                for (const pr of filteredPRs) {
                  let includeThisPR = true;
                  
                  // Check WIP filter first (doesn't require API call)
                  if (combinedSettings.filterByWip) {
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
                      headers: { Authorization: `token ${combinedSettings.githubToken}` }
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
                      
                      // Apply filtering based on settings (continue from WIP check above)
                      if (combinedSettings.filterByApprovals && pr.approvals >= 2) {
                        includeThisPR = false; // Exclude PRs with 2+ approvals
                      }
                      
                      if (combinedSettings.filterByMyApproval && userHasApproved) {
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
      
      // Add to total badge count
      totalBadgeCount += pendingCount;
      
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
    
    // Update badge counter to match the total filtered PR count
    updateBadgeCounter(totalBadgeCount);
    console.log(`Updated badge counter to: ${totalBadgeCount}`);
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

  // Initialize popup filter checkboxes
  const popupFilterApprovals = document.getElementById('popup-filter-approvals');
  const popupFilterMyApproval = document.getElementById('popup-filter-my-approval');
  const popupFilterWip = document.getElementById('popup-filter-wip');
  
  // Load current filter settings and sync with checkboxes
  function loadFilterSettings() {
    chrome.storage.sync.get({ filterByApprovals: false, filterByMyApproval: false, filterByWip: false }, (settings) => {
      if (popupFilterApprovals) {
        popupFilterApprovals.checked = settings.filterByApprovals;
      }
      if (popupFilterMyApproval) {
        popupFilterMyApproval.checked = settings.filterByMyApproval;
      }
      if (popupFilterWip) {
        popupFilterWip.checked = settings.filterByWip;
      }
    });
  }
  
  // Save filter settings when checkboxes change
  function saveFilterSettings() {
    const settings = {
      filterByApprovals: popupFilterApprovals ? popupFilterApprovals.checked : false,
      filterByMyApproval: popupFilterMyApproval ? popupFilterMyApproval.checked : false,
      filterByWip: popupFilterWip ? popupFilterWip.checked : false
    };
    
    chrome.storage.sync.set(settings, () => {
      console.log('Filter settings saved:', settings);
      // Reload PR list to apply new filters (this will also update badge)
      loadPRPages();
      
      // Trigger background re-check to update badge counter with new filters
      chrome.runtime.sendMessage({ 
        type: 'check-now' 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to trigger background re-check:', chrome.runtime.lastError);
        } else {
          console.log('Background re-check triggered for filter update');
        }
      });
      
      showStatus('Filters updated! Badge counter synchronized 🔍', 'info');
    });
  }
  
  // Add event listeners for filter checkboxes
  if (popupFilterApprovals) {
    popupFilterApprovals.addEventListener('change', saveFilterSettings);
  }
  if (popupFilterMyApproval) {
    popupFilterMyApproval.addEventListener('change', saveFilterSettings);
  }
  if (popupFilterWip) {
    popupFilterWip.addEventListener('change', saveFilterSettings);
  }
  
  // Load filter settings on popup open
  loadFilterSettings();

  // Handle collapsible sections
  function setupCollapsibleSections() {
    console.log('Setting up collapsible sections...');
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    console.log('Found collapsible headers:', collapsibleHeaders.length);
    
    collapsibleHeaders.forEach((header, index) => {
      console.log(`Adding click listener to collapsible header ${index}:`, header);
      const targetId = header.getAttribute('data-target');
      const targetElement = document.getElementById(targetId);
      const icon = header.querySelector('.collapse-icon');
      
      console.log(`Header ${index} - Target ID: ${targetId}, Element found: ${!!targetElement}, Icon found: ${!!icon}`);
      
      header.addEventListener('click', (e) => {
        // Check if the click came from a button inside the header
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
          console.log('Click originated from button, ignoring collapse toggle');
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Collapsible header clicked:', targetId);
        
        if (targetElement && icon) {
          const isCurrentlyHidden = targetElement.style.display === 'none';
          
          if (isCurrentlyHidden) {
            // Expand
            targetElement.style.display = 'block';
            icon.textContent = '▲';
            header.setAttribute('aria-expanded', 'true');
            console.log('Expanded section:', targetId);
          } else {
            // Collapse
            targetElement.style.display = 'none';
            icon.textContent = '▼';
            header.setAttribute('aria-expanded', 'false');
            console.log('Collapsed section:', targetId);
          }
        } else {
          console.warn('Could not find target element or icon:', targetId);
        }
      });
    });
  }
  
  // Initialize collapsible sections
  console.log('Initializing collapsible sections...');
  setupCollapsibleSections();

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

  // Render PR overview as HTML with clickable links
  function renderPROverview(overviewData, totalPRs) {
    let html = '';
    
    if (overviewData.length === 0) {
      html = '<div class="text-center" style="color: var(--text-secondary); font-style: italic;">✅ No open PRs found for tracked users in any repository!</div>';
    } else {
      html = `<div class="pr-overview-header">📋 <strong>GitHub PRs to Review (${totalPRs} total):</strong></div><br>`;
      
      overviewData.forEach((repo, index) => {
        const userFilter = '' //repo.trackedUsers.length > 0 ? 
          //` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
        
        html += `<div class="repo-section">`;
        html += `<div class="repo-title"><strong>${index + 1}. ${repo.repoName}</strong> (${repo.prs.length} PRs${userFilter})</div>`;
        
        repo.prs.forEach(pr => {
          const author = pr.user.login;
          const createdDate = new Date(pr.created_at).toLocaleDateString();
          // Truncate long PR titles for popup display
          const title = pr.title.length > 50 ? pr.title.substring(0, 50) + '...' : pr.title;
          
          // Show approval status
          const approvalStatus = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
          
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
      const userFilter = ''//repo.trackedUsers.length > 0 ? 
        //` [Tracking: ${repo.trackedUsers.map(u => `@${u}`).join(', ')}]` : '';
      
      plainText += `${index + 1}. ${repo.repoName} (${repo.prs.length} PRs${userFilter})\n`;
      repo.prs.forEach(pr => {
        const author = pr.user.login;
        const createdDate = new Date(pr.created_at).toLocaleDateString();
        const approvalStatus = pr.approvals !== undefined ? ` (${pr.approvals}/2 approvals)` : '';
        plainText += `   - ${pr.title}${approvalStatus}\n     by @${author} (${createdDate})\n     ${pr.html_url}\n\n`;
      });
      plainText += '\n';
    });
    
    return plainText;
  }

  // Shared function to automatically post to Teams with duplicate detection
  async function autoPostToTeams(overviewData, totalPRs, context = 'manual') {
    console.log(`🚀 Auto-posting to Teams from ${context}...`);
    
    // Get Teams webhook settings
    const teamsSettings = await new Promise(resolve => {
      chrome.storage.sync.get({
        teamsWebhookUrl: '',
        teamsSenderName: 'PR Manager Bot'
      }, resolve);
    });
    
    if (!teamsSettings.teamsWebhookUrl) {
      console.log('⏭️ No Teams webhook URL configured - skipping auto-post');
      return { success: false, reason: 'No webhook URL configured' };
    }
    
    if (totalPRs === 0) {
      console.log('⏭️ No PRs to post - skipping auto-post');
      return { success: false, reason: 'No PRs found' };
    }
    
    try {
      // Generate content hash to check for changes
      const currentContentHash = generateContentHash(overviewData, totalPRs);
      
      // Check if content has changed since last post
      const { lastTeamsContentHash } = await new Promise(resolve => {
        chrome.storage.sync.get({ lastTeamsContentHash: null }, resolve);
      });
      
      if (lastTeamsContentHash === currentContentHash) {
        console.log('⏭️ No changes detected since last Teams post - skipping to avoid spam');
        return { success: false, reason: 'No changes detected' };
      }
      
      // Create Teams payload
      const teamsCard = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": `GitHub PRs to Review (${totalPRs} total)`,
        "themeColor": "0076D7",
        "title": `📋 GitHub PRs to Review (${totalPRs} total) [${context}]`,
        "originator": teamsSettings.teamsSenderName,
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
      
      // Create alternative simple text format for Teams Workflows
      const simplePayload = {
        "text": `📋 **GitHub PRs to Review (${totalPRs} total)** [${context}]\n\n` +
               overviewData.map(repoData => 
                 `**📁 ${repoData.repoName}** (${repoData.prs.length} PRs)\n` +
                 repoData.prs.slice(0, 5).map(pr => {
                   const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
                   return `• [${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}](${pr.html_url}) by @${pr.user.login}${approvalText}`;
                 }).join('\n') +
                 (repoData.prs.length > 5 ? `\n• ...and ${repoData.prs.length - 5} more PRs` : '')
               ).join('\n\n') +
               `\n\n*Posted by ${teamsSettings.teamsSenderName}*`
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Try MessageCard format first, then simple text format
      let response;
      try {
        response = await fetch(teamsSettings.teamsWebhookUrl, {
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
          response = await fetch(teamsSettings.teamsWebhookUrl, {
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
          response = await fetch(teamsSettings.teamsWebhookUrl, {
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
        
        console.log(`🎉 Successfully auto-posted ${totalPRs} PRs to Teams!`);
        return { success: true, message: `Auto-posted ${totalPRs} PRs to Teams!` };
      } else {
        const responseText = await response.text();
        console.error('Teams auto-posting response error:', responseText);
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Teams auto-posting error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out (check your network connection)';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - check your internet connection and webhook URL';
      } else {
        errorMessage = error.message;
      }
      
      return { success: false, reason: errorMessage };
    }
  }

  // Generate content hash for change detection (same as options.js)
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
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
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
        
        // Update badge counter to match PR overview count
        updateBadgeCounter(totalPRs);
        
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
        
        // Auto-post to Teams (respects duplicate detection)
        const teamsResult = await autoPostToTeams(overviewData, totalPRs, 'popup-overview');
        
        if (teamsResult.success) {
          showStatus(`PR overview loaded! Badge updated to ${totalPRs}. ${teamsResult.message} 📋🎉`, 'success');
        } else {
          let statusMessage = `PR overview loaded! Badge updated to ${totalPRs} 📋`;
          if (teamsResult.reason === 'No changes detected') {
            statusMessage += ' (Teams: no changes to post)';
          } else if (teamsResult.reason === 'No webhook URL configured') {
            statusMessage += ' (Teams: not configured)';
          } else if (teamsResult.reason !== 'No PRs found') {
            statusMessage += ` (Teams error: ${teamsResult.reason})`;
          }
          showStatus(statusMessage, teamsResult.reason.includes('error') ? 'warning' : 'success');
        }
      } catch (error) {
        console.error('Failed to load PR overview:', error);
        showStatus(error.message + ' ❌', 'error');
      }
    });
  }

  // Close PR Overview button
  const closeOverviewBtn = document.getElementById('close-pr-overview');
  if (closeOverviewBtn) {
    closeOverviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent the collapsible header from triggering
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

  // Debug badge counter button
  const debugBadgeBtn = document.getElementById('debug-badge');
  if (debugBadgeBtn) {
    debugBadgeBtn.addEventListener('click', async () => {
      console.log('Debug badge button clicked');
      
      // Get current filter settings and display them
      chrome.storage.sync.get({ 
        filterByApprovals: false, 
        filterByMyApproval: false, 
        filterByWip: false,
        repositories: [],
        githubToken: ''
      }, async (settings) => {
        console.log('Current filter settings:', settings);
        
        try {
          // Generate PR overview to get the actual count
          const { overviewData, totalPRs } = await generatePROverview();
          
          const message = `Debug Info:
- WIP Filter: ${settings.filterByWip ? 'ENABLED' : 'DISABLED'}
- Approvals Filter: ${settings.filterByApprovals ? 'ENABLED' : 'DISABLED'}
- My Approval Filter: ${settings.filterByMyApproval ? 'ENABLED' : 'DISABLED'}
- Repositories: ${settings.repositories.length}
- GitHub Token: ${settings.githubToken ? 'SET' : 'NOT SET'}
- PR Overview Count: ${totalPRs}

Updating badge to match PR overview count...`;
          
          showStatus(message, 'info');
          
          // Update badge to match PR overview
          updateBadgeCounter(totalPRs);
          
          setTimeout(() => {
            showStatus(`Badge counter synchronized with PR overview: ${totalPRs}`, 'success');
          }, 1000);
          
        } catch (error) {
          showStatus(`Error: ${error.message}`, 'error');
        }
      });
    });
  }
  
  // Function to update extension badge counter
  function updateBadgeCounter(count) {
    try {
      chrome.runtime.sendMessage({ 
        type: 'update-badge', 
        count: count 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to update badge:', chrome.runtime.lastError);
        } else {
          console.log(`Badge counter updated to: ${count}`);
        }
      });
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }
});
