document.addEventListener('DOMContentLoaded', () => {

  // -------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------
  let connectedRepo = '';

  // -------------------------------------------------------------
  // DOM ELEMENT SELECTORS
  // -------------------------------------------------------------
  const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const modeToggle = document.getElementById('mode-toggle');
  const userApiKeyInput = document.getElementById('user-api-key');
  const modelStatusIndicator = document.getElementById('model-status-indicator');
  const exitConsoleBtn = document.getElementById('exit-console-btn');
  const consoleLogoBack = document.getElementById('console-logo-back');

  // GitHub Connection DOM
  const githubConnectCard = document.getElementById('github-connect-card');
  const githubRepoInput = document.getElementById('github-repo-input');
  const githubConnectBtn = document.getElementById('github-connect-btn');
  const githubConnectionMsg = document.getElementById('github-connection-msg');
  const githubConnectionStatus = document.getElementById('github-connection-status');

  // Diagnostics DOM
  const diagLastModel = document.getElementById('diag-last-model');
  const diagLastKey = document.getElementById('diag-last-key');

  // -------------------------------------------------------------
  // ROUTING REDIRECT
  // -------------------------------------------------------------
  exitConsoleBtn?.addEventListener('click', () => {
    window.location.href = '/';
  });
  consoleLogoBack?.addEventListener('click', () => {
    window.location.href = '/';
  });

  // Tab switching inside console
  sidebarMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      sidebarMenuItems.forEach(menu => menu.classList.remove('active'));
      item.classList.add('active');

      tabPanes.forEach(pane => pane.classList.remove('active'));
      const targetTabId = `tab-${item.getAttribute('data-tab')}`;
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // -------------------------------------------------------------
  // LIVE VS DEMO MODE FIELD TOGGLE
  // -------------------------------------------------------------
  function getMode() {
    return modeToggle.checked ? 'demo' : 'live';
  }

  function getApiKey() {
    return userApiKeyInput.value.trim() || '';
  }

  function toggleModeFields() {
    const isDemo = getMode() === 'demo';
    if (isDemo) {
      githubConnectCard.style.display = 'none';
      if (githubConnectionStatus) {
        githubConnectionStatus.className = 'status-indicator';
        githubConnectionStatus.innerHTML = '<i class="fa-brands fa-github text-green"></i> <span>Git Connected (Demo)</span>';
      }
    } else {
      githubConnectCard.style.display = 'block';
      updateGitStatusUI();
    }
  }

  function updateGitStatusUI() {
    if (connectedRepo) {
      githubConnectionStatus.innerHTML = `<i class="fa-brands fa-github text-green"></i> <span>Connected: ${connectedRepo}</span>`;
      githubConnectionMsg.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Connected successfully to ${connectedRepo}</span>`;
    } else {
      githubConnectionStatus.innerHTML = '<i class="fa-brands fa-github text-yellow"></i> <span>Git Disconnected</span>';
      githubConnectionMsg.innerHTML = '<span class="helper-text text-yellow"><i class="fa-solid fa-triangle-exclamation"></i> Action Required: Connect a public repository to proceed.</span>';
    }
  }

  modeToggle?.addEventListener('change', toggleModeFields);
  toggleModeFields(); // Initial call

  // Toggle Gemini API Key Visibility
  const toggleVisibilityBtn = document.getElementById('toggle-api-key-visibility');
  const toggleVisibilityIcon = document.getElementById('toggle-api-key-icon');
  toggleVisibilityBtn?.addEventListener('click', () => {
    if (userApiKeyInput && userApiKeyInput.type === 'password') {
      userApiKeyInput.type = 'text';
      toggleVisibilityIcon?.classList.remove('fa-eye');
      toggleVisibilityIcon?.classList.add('fa-eye-slash');
    } else if (userApiKeyInput) {
      userApiKeyInput.type = 'password';
      toggleVisibilityIcon?.classList.remove('fa-eye-slash');
      toggleVisibilityIcon?.classList.add('fa-eye');
    }
  });

  // -------------------------------------------------------------
  // GITHUB REPOSITORY CONNECTION ACTION
  // -------------------------------------------------------------
  githubConnectBtn?.addEventListener('click', async () => {
    const rawRepo = githubRepoInput.value.trim();
    if (!rawRepo) {
      githubConnectionMsg.innerHTML = '<span class="text-red">Please enter repository owner/name.</span>';
      return;
    }

    // Sanitize repository input
    let repoVal = rawRepo;
    repoVal = repoVal.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
    repoVal = repoVal.replace(/\.git$/i, '');
    repoVal = repoVal.replace(/\/+$/, '');

    githubConnectionMsg.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin"></i> Locating repository: ${repoVal}...</span>`;
    githubConnectBtn.disabled = true;

    try {
      const response = await fetch(`https://api.github.com/repos/${repoVal}`);
      if (response.ok) {
        connectedRepo = repoVal;
        updateGitStatusUI();
        githubRepoInput.disabled = true;
        githubConnectBtn.style.display = 'none';
      } else {
        githubConnectionMsg.innerHTML = `
          <span class="text-red"><i class="fa-solid fa-circle-xmark"></i> Verification failed (limits exceeded or private repo).</span><br>
          <button type="button" id="github-force-btn" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-top: 6px;">Connect Anyway</button>
        `;
        githubConnectBtn.disabled = false;

        document.getElementById('github-force-btn')?.addEventListener('click', () => {
          connectedRepo = repoVal;
          updateGitStatusUI();
          githubRepoInput.disabled = true;
          githubConnectBtn.style.display = 'none';
        });
      }
    } catch (err) {
      githubConnectionMsg.innerHTML = `
        <span class="text-red">Connection error: ${err.message}</span><br>
        <button type="button" id="github-force-btn-err" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-top: 6px;">Connect Anyway</button>
      `;
      githubConnectBtn.disabled = false;

      document.getElementById('github-force-btn-err')?.addEventListener('click', () => {
        connectedRepo = repoVal;
        updateGitStatusUI();
        githubRepoInput.disabled = true;
        githubConnectBtn.style.display = 'none';
      });
    }
  });

  function updateAiDiagnostics(meta) {
    if (!meta) return;
    if (diagLastModel) diagLastModel.textContent = meta.modelUsed || 'N/A';
    if (diagLastKey) diagLastKey.textContent = meta.keyUsed || 'N/A';
    if (modelStatusIndicator) {
      modelStatusIndicator.textContent = `Gemini: ${meta.modelUsed || 'Active'}`;
    }
  }

  // -------------------------------------------------------------
  // FEATURES INTERACTION
  // -------------------------------------------------------------

  // Feature 1: Pre-Deployment Risk Analyzer
  const analyzeForm = document.getElementById('analyze-form');
  const pipelineLogs = document.getElementById('pipeline-logs');
  const riskBadge = document.getElementById('risk-badge');
  const gaugeCircle = document.getElementById('gauge-circle');
  const gaugeScoreText = document.getElementById('gauge-score-text');
  const gaugeRec = document.getElementById('gauge-recommendation');
  
  const bdMemory = document.getElementById('breakdown-memory');
  const bdBugs = document.getElementById('breakdown-bugs');
  const bdLatency = document.getElementById('breakdown-latency');
  const bdHistory = document.getElementById('breakdown-history');
  
  const riskMarkdownContainer = document.getElementById('risk-ai-markdown');

  analyzeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const version = document.getElementById('release-version').value.trim();
    const service = document.getElementById('target-service').value;
    const mode = getMode();
    const apiKey = getApiKey();

    if (mode === 'live' && !connectedRepo) {
      alert('You must connect a GitHub repository first to run Live Mode audits.');
      return;
    }

    // Reset results & Start logs
    pipelineLogs.innerHTML = '';
    riskMarkdownContainer.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Gathering pipeline telemetries...</p></div>`;
    
    const logSteps = [
      'Initializing pre-deployment scan routine...',
      mode === 'live' ? `github-api: Fetching recent commits for "${connectedRepo}"...` : 'github-mcp: Loading package commits...',
      'jira-mcp: Auditing open bugs and blockers...',
      'prometheus-mcp: Loading system telemetry & cpu/memory loads...',
      'rag-db: Matching deployment blueprints against historical runbooks...',
      'gemini-service: Evaluating risk matrices using Gemini LLM...'
    ];

    for (let i = 0; i < logSteps.length; i++) {
      const line = document.createElement('div');
      line.className = 'log-line info';
      line.textContent = `[${new Date().toLocaleTimeString()}] ${logSteps[i]}`;
      pipelineLogs.appendChild(line);
      pipelineLogs.scrollTop = pipelineLogs.scrollHeight;
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const response = await fetch('/api/analyze-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, service, mode, apiKey, githubRepo: connectedRepo })
      });
      const data = await response.json();

      // Render score gauge (radius=50, circumference = 314.16)
      const score = data.riskScore;
      const offset = 314.16 * (1 - score / 100);
      gaugeCircle.style.strokeDashoffset = offset;
      gaugeScoreText.textContent = score;

      if (score > 70) {
        gaugeCircle.style.stroke = 'var(--color-red)';
        riskBadge.textContent = 'High Risk';
        riskBadge.className = 'badge badge-red';
        gaugeRec.textContent = 'Delay Deployment';
      } else if (score > 40) {
        gaugeCircle.style.stroke = 'var(--color-yellow)';
        riskBadge.textContent = 'Medium Risk';
        riskBadge.className = 'badge badge-yellow';
        gaugeRec.textContent = 'Canary Split';
      } else {
        gaugeCircle.style.stroke = 'var(--color-green)';
        riskBadge.textContent = 'Low Risk';
        riskBadge.className = 'badge badge-green';
        gaugeRec.textContent = 'Deploy Approved';
      }

      bdMemory.style.width = `${(data.breakdown.memoryRisk / 25) * 100}%`;
      bdBugs.style.width = `${(data.breakdown.bugRisk / 25) * 100}%`;
      bdLatency.style.width = `${(data.breakdown.latencyRisk / 25) * 100}%`;
      bdHistory.style.width = `${(data.breakdown.historicalRisk / 25) * 100}%`;

      riskMarkdownContainer.innerHTML = parseMarkdown(data.report);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      pipelineLogs.innerHTML += `<div class="log-line error">[ERROR] Failed to fetch risk data: ${err.message}</div>`;
    }
  });

  // Feature 2: Incident Time Machine
  const outageForm = document.getElementById('outage-form');
  const timelineSteps = document.getElementById('incident-steps-timeline');
  const outageMarkdown = document.getElementById('outage-ai-markdown');

  outageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = document.getElementById('outage-query').value.trim();
    const mode = getMode();
    const apiKey = getApiKey();

    outageMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Reconstructing incident logs...</p></div>`;

    try {
      const response = await fetch('/api/explain-outage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode, apiKey })
      });
      const data = await response.json();

      timelineSteps.innerHTML = '';
      data.timeline.forEach((step, idx) => {
        const li = document.createElement('li');
        li.className = 'timeline-step completed-step';
        if (step.toLowerCase().includes('started') || step.toLowerCase().includes('completed')) {
          li.className = 'timeline-step completed-step';
        } else if (step.toLowerCase().includes('spike') || step.toLowerCase().includes('exhaustion') || step.toLowerCase().includes('increase')) {
          li.className = 'timeline-step warn-step';
        } else if (step.toLowerCase().includes('failure') || step.toLowerCase().includes('restart')) {
          li.className = 'timeline-step failed-step';
        }

        li.innerHTML = `
          <div class="step-bullet"></div>
          <div class="step-content"><strong>${step.split(' - ')[0] || ''}</strong> ${step.split(' - ')[1] || step}</div>
        `;
        timelineSteps.appendChild(li);
      });

      outageMarkdown.innerHTML = parseMarkdown(data.analysis);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      outageMarkdown.innerHTML = `<p class="text-red">Failed to reconstruct outage: ${err.message}</p>`;
    }
  });

  // Feature 3: Release Advisor
  const adviceForm = document.getElementById('advice-form');
  const adviceMarkdown = document.getElementById('advice-ai-markdown');

  adviceForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const service = document.getElementById('advice-service').value;
    const apiKey = getApiKey();

    adviceMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Consulting release advisor template...</p></div>`;

    try {
      const response = await fetch('/api/deployment-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, apiKey })
      });
      const rawData = await response.json();

      adviceMarkdown.innerHTML = parseMarkdown(rawData.advice);
      updateAiDiagnostics(rawData.aiMeta);

    } catch (err) {
      adviceMarkdown.innerHTML = `<p class="text-red">Failed to retrieve advice: ${err.message}</p>`;
    }
  });

  // Feature 4: Root Cause Anomaly Scanner
  const investigateForm = document.getElementById('investigate-form');
  const metricCpu = document.getElementById('metric-cpu');
  const metricMem = document.getElementById('metric-mem');
  const metricLatency = document.getElementById('metric-latency');
  const metricError = document.getElementById('metric-error');
  const investigateMarkdown = document.getElementById('investigate-ai-markdown');

  investigateForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const service = document.getElementById('investigate-service').value;
    const apiKey = getApiKey();

    investigateMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Scanning active anomalies...</p></div>`;

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, apiKey })
      });
      const data = await response.json();

      if (data.activeMetrics) {
        metricCpu.textContent = data.activeMetrics.cpuUsage;
        metricMem.textContent = data.activeMetrics.memoryUsage;
        metricLatency.textContent = data.activeMetrics.latency;
        metricError.textContent = data.activeMetrics.errorRate;

        const metricCards = document.querySelectorAll('.telemetry-gauge-card');
        metricCards.forEach(c => {
          c.className = 'telemetry-gauge-card bg-glass-dark';
          if (data.activeMetrics.status === 'critical') {
            c.classList.add('badge-red');
          } else if (data.activeMetrics.status === 'warning') {
            c.classList.add('badge-yellow');
          } else {
            c.classList.add('badge-green');
          }
        });
      }

      investigateMarkdown.innerHTML = parseMarkdown(data.investigation);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      investigateMarkdown.innerHTML = `<p class="text-red">Failed to complete investigation: ${err.message}</p>`;
    }
  });

  // Feature 5: Slack Workspace Simulator
  const slackForm = document.getElementById('slack-form');
  const slackInput = document.getElementById('slack-input');
  const slackFeed = document.getElementById('slack-feed');
  const commandBadges = document.querySelectorAll('.quick-commands-list button');

  commandBadges.forEach(b => {
    b.addEventListener('click', () => {
      slackInput.value = b.getAttribute('data-cmd');
      slackInput.focus();
    });
  });

  slackForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const commandText = slackInput.value.trim();
    if (!commandText) return;

    appendUserSlackMessage(commandText);
    slackInput.value = '';

    try {
      const response = await fetch('/api/slack-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandText })
      });
      const data = await response.json();
      await new Promise(r => setTimeout(r, 800));
      appendBotSlackMessage(data);

    } catch (err) {
      appendBotSlackMessage({
        text: `Error connecting to simulator router: ${err.message}`,
        blocks: []
      });
    }
  });

  function appendUserSlackMessage(text) {
    const div = document.createElement('div');
    div.className = 'slack-message';
    div.innerHTML = `
      <div class="avatar" style="background:#1f75cb;"><i class="fa-solid fa-circle-user"></i></div>
      <div class="message-content">
        <div class="sender-name">Operator <span class="timestamp">${new Date().toLocaleTimeString()}</span></div>
        <div class="message-text"><code>${text}</code></div>
      </div>
    `;
    slackFeed.appendChild(div);
    slackFeed.scrollTop = slackFeed.scrollHeight;
  }

  function appendBotSlackMessage(data) {
    const div = document.createElement('div');
    div.className = 'slack-message';
    
    let attachmentsHtml = '';
    
    if (data.blocks && data.blocks.length > 0) {
      const sectionBlock = data.blocks.find(b => b.type === 'section' && b.fields);
      const riskScoreField = sectionBlock?.fields.find(f => f.text.includes('Risk Score'));
      let riskClass = '';
      if (riskScoreField) {
        const matches = riskScoreField.text.match(/\d+/);
        if (matches && parseInt(matches[0]) > 70) {
          riskClass = 'high-risk';
        } else if (matches && parseInt(matches[0]) > 40) {
          riskClass = 'medium-risk';
        } else {
          riskClass = 'low-risk';
        }
      }

      data.blocks.forEach(block => {
        if (block.type === 'section') {
          if (block.fields) {
            attachmentsHtml += `
              <div class="slack-attachment-card ${riskClass}">
                <div class="slack-attachment-fields">
                  ${block.fields.map(f => `<div class="slack-attachment-field">${f.text.replace(/\*/g, '')}</div>`).join('')}
                </div>
            `;
          } else if (block.text) {
            if (block.text.text.includes('Release Analysis') || block.text.text.includes('Incident Time Machine') || block.text.text.includes('Advisor') || block.text.text.includes('Root Cause')) {
              attachmentsHtml += `<div class="slack-attachment-title">${block.text.text.replace(/\*/g, '')}</div>`;
            } else {
              attachmentsHtml += `<div class="message-text">${block.text.text.replace(/\*/g, '').replace(/\n/g, '<br>')}</div>`;
            }
          }
        } else if (block.type === 'actions') {
          attachmentsHtml += `
            <div class="slack-actions">
              ${block.elements.map(el => {
                const isDanger = el.style === 'danger';
                const isPrimary = el.style === 'primary';
                const btnClass = isDanger ? 'btn-slack-danger' : (isPrimary ? 'btn-slack-primary' : '');
                return `<button class="slack-btn ${btnClass}">${el.text.text}</button>`;
              }).join('')}
            </div>
          `;
        }
      });
      
      if (sectionBlock) {
        attachmentsHtml += `</div>`;
      }
    }

    div.innerHTML = `
      <div class="avatar"><i class="fa-solid fa-shield-halved"></i></div>
      <div class="message-content">
        <div class="sender-name">Sentinel AI <span class="app-tag">APP</span> <span class="timestamp">${new Date().toLocaleTimeString()}</span></div>
        <div class="message-text">${data.text}</div>
        ${attachmentsHtml}
      </div>
    `;
    slackFeed.appendChild(div);
    slackFeed.scrollTop = slackFeed.scrollHeight;
  }

  // -------------------------------------------------------------
  // HELPER: BASIC MARKDOWN PARSER
  // -------------------------------------------------------------
  function parseMarkdown(mdText) {
    if (!mdText) return '';
    let html = mdText;

    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/`(.*?)`/gim, '<code>$1</code>');
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    return html;
  }

  // Set Live Mode if URL param live=true is set
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('live') === 'true' && modeToggle) {
    modeToggle.checked = false; // demo is checked, live is unchecked
    toggleModeFields();
  }

  // Fetch fallback credentials from backend config
  async function fetchConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        const display = document.getElementById('fallback-key-display');
        if (display && data.fallbackApiKey) {
          display.textContent = data.fallbackApiKey;
        }
      }
    } catch (err) {
      console.error('Failed to fetch configuration details:', err);
    }
  }
  fetchConfig();
});
