import { App, ExpressReceiver } from '@slack/bolt';
import express from 'express';
import mongoose from 'mongoose';
import { db } from './database/mockDb';
import { RiskEngine } from './utils/helpers';
import { GeminiService } from './ai/geminiService';
import { IncidentModel } from './database/mongo';

let slackApp: App;
let receiver: ExpressReceiver | undefined;

// In-memory registry to track connected GitHub repositories per Slack channel
const connectedRepos: Record<string, string> = {};

/**
 * Format markdown response for Slack compatibility
 */
function formatMarkdownForSlack(text: string): string {
  return text
    .replace(/^###? (.*)$/gm, '*$1*') // Headings to bold
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // **bold** to *bold*
    .replace(/^\s*[-*]\s+/gm, '• '); // Bullet points
}

/**
 * Simple parameter parser for commands and app mentions
 */
function parseParams(text: string) {
  let version = 'v1.0.0';
  let service = 'checkout-service';
  let repo = '';

  // Extract version like v1.2.3
  const versionMatch = text.match(/v\d+(\.\d+)*/i);
  if (versionMatch) {
    version = versionMatch[0];
  }

  // Extract service name
  const serviceMatch = text.match(/service[=:\s]+([a-zA-Z0-9_-]+)/i);
  if (serviceMatch) {
    service = serviceMatch[1];
  }

  // Extract repo owner/name
  const repoMatch = text.match(/repo[=:\s]+([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/i);
  if (repoMatch) {
    repo = repoMatch[1];
  }

  return { version, service, repo };
}

/**
 * Helper to fetch from GitHub API with optional auth tokens
 */
async function fetchGitHub(url: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'sentinel-ai-devops-guardian'
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  } else if (process.env.GITHUB_PAT) {
    headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Helper to fetch the repository structure (file tree)
 */
async function getRepoTree(repo: string): Promise<any[]> {
  try {
    const data = await fetchGitHub(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
    return data.tree || [];
  } catch (err: any) {
    console.warn(`[Slack getRepoTree] Failed fetching main branch tree: ${err.message}. Retrying master branch...`);
    try {
      const data = await fetchGitHub(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`);
      return data.tree || [];
    } catch (retryErr: any) {
      console.error(`[Slack getRepoTree] Failed fetching master branch tree: ${retryErr.message}`);
      return [];
    }
  }
}

/**
 * Helper to fetch file content and decode from base64
 */
async function getFileContent(repo: string, filePath: string): Promise<string> {
  const data = await fetchGitHub(`https://api.github.com/repos/${repo}/contents/${filePath}`);
  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return '';
}

/**
 * Intelligent file matcher based on query keywords and exact filenames
 */
function findRelevantFiles(tree: any[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const matchedPaths: string[] = [];
  
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const pathLower = item.path.toLowerCase();
    
    const isMatched = words.some(word => {
      if (word.length < 3) return false;
      if (['the', 'and', 'for', 'repo', 'github', 'explain', 'what', 'how', 'show', 'view', 'read', 'ask'].includes(word)) return false;
      return pathLower.includes(word);
    });
    
    if (isMatched) {
      matchedPaths.push(item.path);
    }
  }
  
  const filenameRegex = /[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g;
  let match;
  while ((match = filenameRegex.exec(query)) !== null) {
    const filename = match[0].toLowerCase();
    for (const item of tree) {
      if (item.type === 'blob' && item.path.toLowerCase().endsWith(filename)) {
        if (!matchedPaths.includes(item.path)) {
          matchedPaths.push(item.path);
        }
      }
    }
  }

  return matchedPaths.slice(0, 5);
}

/**
 * Initialize the Slack Bolt application
 */
export function initSlack(expressApp: express.Application) {
  const token = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET || 'temp-secret';
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!token) {
    console.warn('[Slack] SLACK_BOT_TOKEN is not configured. Slack Bot will not start.');
    return;
  }

  const isSocketMode = !!appToken;

  if (isSocketMode) {
    console.log('[Slack] Initializing in Socket Mode...');
    slackApp = new App({
      token,
      appToken,
      socketMode: true
    });
  } else {
    console.log('[Slack] Initializing in HTTP Event Subscriptions Mode...');
    receiver = new ExpressReceiver({
      signingSecret,
      processBeforeResponse: true
    });
    slackApp = new App({
      token,
      receiver
    });
    expressApp.use('/slack/events', receiver.router);
    console.log('[Slack] Mounted receiver router at /slack/events');
  }

  registerSlackHandlers(slackApp);

  if (isSocketMode) {
    slackApp.start().then(() => {
      console.log('[Slack] Slack Bot started successfully in Socket Mode!');
    }).catch(err => {
      console.error('[Slack] Failed to start Slack Bot in Socket Mode:', err);
    });
  } else {
    console.log('[Slack] Slack Bot event listeners registered successfully.');
  }
}

/**
 * Register event listeners, commands, and actions
 */
function registerSlackHandlers(app: App) {
  // Action handler: Delay Deployment
  app.action('delay_deploy', async ({ ack, body, client }) => {
    await ack();
    const channel = body.channel?.id;
    const messageTs = (body as any).message?.ts;
    if (channel && messageTs) {
      await client.chat.postMessage({
        channel,
        thread_ts: messageTs,
        text: `🛑 *Deployment Delayed* by <@${body.user.id}>. Notification sent to DevOps and SRE teams.`
      });
    }
  });

  // Action handler: Deploy to Canary
  app.action('canary_deploy', async ({ ack, body, client }) => {
    await ack();
    const channel = body.channel?.id;
    const messageTs = (body as any).message?.ts;
    if (channel && messageTs) {
      await client.chat.postMessage({
        channel,
        thread_ts: messageTs,
        text: `🧪 *Canary Deployment Triggered* by <@${body.user.id}> (10% traffic split). Monitoring active telemetry for JVM heap leaks...`
      });
    }
  });

  // Event handler: App Mention
  app.event('app_mention', async ({ event, client, say }) => {
    const rawText = event.text;
    const channel = event.channel;
    const threadTs = event.thread_ts || event.ts;
    
    const cleanedText = rawText.replace(/<@[A-Z0-9]+>/g, '').trim();
    const lowerText = cleanedText.toLowerCase();

    console.log(`[Slack] App mention from user ${event.user}: "${cleanedText}"`);

    try {
      // Connect command check: connect repo <owner/repo>
      const connectMatch = cleanedText.match(/connect\s+repo\s+([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/i);
      if (connectMatch) {
        const repo = connectMatch[1];
        await say({
          channel,
          thread_ts: threadTs,
          text: `📁 Verifying connection to GitHub repository \`${repo}\`...`
        });
        
        try {
          const tree = await getRepoTree(repo);
          if (!tree || tree.length === 0) {
            await say({
              channel,
              thread_ts: threadTs,
              text: `❌ Could not connect to repository \`${repo}\`. Verify it exists and is public, or check your GITHUB_TOKEN credentials.`
            });
            return;
          }
          
          connectedRepos[channel] = repo;
          await say({
            channel,
            thread_ts: threadTs,
            text: `✅ *Successfully connected to repository:* \`${repo}\` for this channel!\nAll subsequent DevOps queries, release checks, and questions will now be answered using this codebase as context.`
          });
        } catch (err: any) {
          await say({
            channel,
            thread_ts: threadTs,
            text: `❌ Failed to connect repository \`${repo}\`: ${err.message}`
          });
        }
        return;
      }

      // MANDATORY CHECK: Ensure a repository is connected to this channel first
      const currentRepo = connectedRepos[channel];
      if (!currentRepo) {
        await say({
          channel,
          thread_ts: threadTs,
          text: `⚠️ *Sentinel AI is not connected to a GitHub repository!*\nBefore I can answer your questions, you must connect a repository first.\n\n👉 *Please run:* \`connect repo owner/repo\` (e.g. \`@Sentinel AI connect repo nomaantalib/Sentinel-AI-SLACK\`)`
        });
        return;
      }

      // Handle standard queries once connected
      if (lowerText.includes('analyze') || lowerText.includes('release')) {
        const { version, service } = parseParams(cleanedText);
        await say({
          channel,
          thread_ts: threadTs,
          text: `🔍 Analyzing release *${version}* for service *${service}* using connected repo *${currentRepo}*...`
        });
        await runReleaseAnalysis(version, service, currentRepo, client, channel, threadTs);
      } 
      else if (lowerText.includes('outage') || lowerText.includes('explain') || lowerText.includes('time machine')) {
        const query = cleanedText.replace(/(explain|outage|time|machine)/gi, '').trim() || 'Friday outage';
        await say({
          channel,
          thread_ts: threadTs,
          text: `⏳ Querying Incident Time Machine for "${query}"...`
        });
        await runExplainOutage(query, client, channel, threadTs);
      } 
      else if (lowerText.includes('advice') || lowerText.includes('strategy') || lowerText.includes('advisor')) {
        const service = parseParams(cleanedText).service;
        await say({
          channel,
          thread_ts: threadTs,
          text: `💡 Querying Release Advisor for service *${service}*...`
        });
        await runDeploymentAdvice(service, client, channel, threadTs);
      } 
      else if (lowerText.includes('investigate') || lowerText.includes('diagnose') || lowerText.includes('root cause')) {
        const service = parseParams(cleanedText).service;
        await say({
          channel,
          thread_ts: threadTs,
          text: `🛠️ Diagnosing active anomalies for service *${service}*...`
        });
        await runInvestigate(service, client, channel, threadTs);
      } 
      else {
        // Every general chat is now answered as an agent query using the connected repo
        await say({
          channel,
          thread_ts: threadTs,
          text: `🤖 Analyzing your request using codebase context from \`${currentRepo}\`...`
        });
        await runAskRepo(currentRepo, cleanedText, client, channel, threadTs);
      }
    } catch (err: any) {
      console.error('[Slack app_mention] Error:', err);
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `❌ Sorry, I encountered an error: ${err.message || err}`
      });
    }
  });

  // Slash Command: /connect-repo <owner/repo>
  app.command('/connect-repo', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const repo = command.text.trim();
    
    const match = repo.match(/^([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)$/i);
    if (!match) {
      await client.chat.postMessage({
        channel,
        text: `❌ Invalid usage. Correct format: \`/connect-repo owner/repo\` (e.g. \`/connect-repo nomaantalib/Sentinel-AI-SLACK\`)`
      });
      return;
    }
    
    try {
      await client.chat.postMessage({
        channel,
        text: `📁 Verifying connection to GitHub repository \`${repo}\`...`
      });
      const tree = await getRepoTree(repo);
      if (!tree || tree.length === 0) {
        await client.chat.postMessage({
          channel,
          text: `❌ Could not connect to repository \`${repo}\`. Verify it exists and is public, or check your GITHUB_TOKEN credentials.`
        });
        return;
      }
      
      connectedRepos[channel] = repo;
      await client.chat.postMessage({
        channel,
        text: `✅ *Successfully connected to repository:* \`${repo}\` for this channel!\nAll queries will now be answered using this codebase context.`
      });
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Failed to connect repository \`${repo}\`: ${err.message}`
      });
    }
  });

  // Slash Command: /ask-repo <owner/repo> <question> (Kept as optional direct command)
  app.command('/ask-repo', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const text = command.text.trim();
    
    const match = text.match(/^([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)\s+(.+)$/i);
    if (!match) {
      await client.chat.postMessage({
        channel,
        text: `❌ Invalid usage. Correct format: \`/ask-repo owner/repo your question\``
      });
      return;
    }
    
    const repo = match[1];
    const question = match[2];
    
    try {
      await client.chat.postMessage({
        channel,
        text: `📁 Querying repository \`${repo}\` for: "${question}"...`
      });
      await runAskRepo(repo, question, client, channel);
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Error querying repository: ${err.message || err}`
      });
    }
  });

  // Slash Command: /analyze-release
  app.command('/analyze-release', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const currentRepo = connectedRepos[channel];
    if (!currentRepo) {
      await client.chat.postMessage({
        channel,
        text: `⚠️ *No GitHub repository connected to this channel!* Please connect first using \`/connect-repo owner/repo\` or mention me with \`connect repo owner/repo\`.`
      });
      return;
    }

    const { version, service } = parseParams(command.text);
    try {
      await client.chat.postMessage({
        channel,
        text: `🔍 Analyzing release *${version}* for service *${service}* using connected repo *${currentRepo}*...`
      });
      await runReleaseAnalysis(version, service, currentRepo, client, channel);
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Error running analysis: ${err.message || err}`
      });
    }
  });

  // Slash Command: /explain-outage
  app.command('/explain-outage', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const currentRepo = connectedRepos[channel];
    if (!currentRepo) {
      await client.chat.postMessage({
        channel,
        text: `⚠️ *No GitHub repository connected to this channel!* Please connect first using \`/connect-repo owner/repo\` or mention me with \`connect repo owner/repo\`.`
      });
      return;
    }

    const query = command.text.trim() || 'Friday outage';
    try {
      await client.chat.postMessage({
        channel,
        text: `⏳ Querying Incident Time Machine for "${query}"...`
      });
      await runExplainOutage(query, client, channel);
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Error running timeline query: ${err.message || err}`
      });
    }
  });

  // Slash Command: /deployment-advice
  app.command('/deployment-advice', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const currentRepo = connectedRepos[channel];
    if (!currentRepo) {
      await client.chat.postMessage({
        channel,
        text: `⚠️ *No GitHub repository connected to this channel!* Please connect first using \`/connect-repo owner/repo\` or mention me with \`connect repo owner/repo\`.`
      });
      return;
    }

    const service = command.text.trim() || 'checkout-service';
    try {
      await client.chat.postMessage({
        channel,
        text: `💡 Querying Release Advisor for service *${service}*...`
      });
      await runDeploymentAdvice(service, client, channel);
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Error fetching advice: ${err.message || err}`
      });
    }
  });

  // Slash Command: /investigate
  app.command('/investigate', async ({ command, ack, client }) => {
    await ack();
    const channel = command.channel_id;
    const currentRepo = connectedRepos[channel];
    if (!currentRepo) {
      await client.chat.postMessage({
        channel,
        text: `⚠️ *No GitHub repository connected to this channel!* Please connect first using \`/connect-repo owner/repo\` or mention me with \`connect repo owner/repo\`.`
      });
      return;
    }

    const service = command.text.trim() || 'checkout-service';
    try {
      await client.chat.postMessage({
        channel,
        text: `🛠️ Diagnosing active anomalies for service *${service}*...`
      });
      await runInvestigate(service, client, channel);
    } catch (err: any) {
      await client.chat.postMessage({
        channel,
        text: `❌ Error running diagnostics: ${err.message || err}`
      });
    }
  });
}

/**
 * Runner for GitHub Repo Context Querying
 */
async function runAskRepo(
  repo: string,
  question: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  try {
    const tree = await getRepoTree(repo);
    if (!tree || tree.length === 0) {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `❌ Could not read the file tree for repository \`${repo}\`. Verify it exists and is public, or check your \`GITHUB_TOKEN\` / \`GITHUB_PAT\` credentials.`
      });
      return;
    }

    let relevantFiles = findRelevantFiles(tree, question);
    
    if (relevantFiles.length === 0) {
      const readme = tree.find((item: any) => item.path.toLowerCase() === 'readme.md');
      const pkg = tree.find((item: any) => item.path.toLowerCase() === 'package.json');
      if (readme) relevantFiles.push(readme.path);
      if (pkg) relevantFiles.push(pkg.path);
    }

    if (relevantFiles.length === 0) {
      const topLevelFiles = tree
        .filter((item: any) => !item.path.includes('/'))
        .slice(0, 10)
        .map((item: any) => `• \`${item.path}\``)
        .join('\n');
      
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `🔍 I couldn't automatically find files matching your query keywords. Here are the top-level files in the repository:\n${topLevelFiles}\n\nPlease ask about one of these files!`
      });
      return;
    }

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `📖 Reading files from repo for context:\n${relevantFiles.map(f => `• \`${f}\``).join('\n')}...`
    });

    let context = `Context from GitHub Repository "${repo}":\n\n`;
    for (const filePath of relevantFiles) {
      try {
        const content = await getFileContent(repo, filePath);
        if (content) {
          const truncatedContent = content.length > 15000 ? content.slice(0, 15000) + '\n[Content Truncated...]' : content;
          context += `--- File: ${filePath} ---\n${truncatedContent}\n\n`;
        }
      } catch (err: any) {
        console.warn(`[Slack runAskRepo] Skipping content fetch for ${filePath}:`, err.message);
      }
    }

    const systemPrompt = `You are Sentinel AI Codebase Guardian, acting as a GitHub MCP Context Provider. 
Analyze the provided codebase files, understand their purpose and architecture, and answer the user's question with high technical accuracy.
Cite specific files, functions, or lines of code in your explanation. Use Slack formatting (e.g. *bold* instead of **bold**, and bullet points).`;

    const userPrompt = `
Here is the codebase context:
${context}

User's Question: ${question}

Please answer the question based on the codebase context provided.`;

    const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, undefined, true);
    const slackText = formatMarkdownForSlack(aiResult.text);

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `💻 *Codebase Analysis for ${repo}*\n\n${slackText}`
    });

  } catch (err: any) {
    console.error('[Slack runAskRepo] Failed:', err);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ Error querying codebase: ${err.message || err}`
    });
  }
}

/**
 * Runners for individual Sentinel tasks
 */

async function runReleaseAnalysis(
  version: string,
  serviceName: string,
  githubRepo: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  let gitCommitContext = '';
  if (githubRepo) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'sentinel-ai-devops-guardian'
      };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      } else if (process.env.GITHUB_PAT) {
        headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
      }

      const gitResponse = await fetch(`https://api.github.com/repos/${githubRepo}/commits`, { headers });
      if (gitResponse.ok) {
        const commits = await gitResponse.json() as any[];
        const lastCommits = commits.slice(0, 5).map(c => 
          `* Commit by ${c.commit.author?.name || 'author'}: "${c.commit.message}"`
        ).join('\n');
        gitCommitContext = `\nRecent GitHub commits in repository "${githubRepo}":\n${lastCommits}`;
      }
    } catch (err) {
      console.error('[Slack runReleaseAnalysis] GitHub fetch error:', err);
    }
  }

  let customIncidents: any[] | undefined = undefined;
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (isMongoConnected) {
    try {
      customIncidents = await IncidentModel.find().lean();
    } catch (dbErr) {
      console.error('[Slack runReleaseAnalysis] MongoDB error:', dbErr);
    }
  }

  const riskAnalysis = RiskEngine.calculateRisk(serviceName, true, customIncidents);

  const allRunbooks = db.getRunbooks();
  const matchedRunbooks = allRunbooks.filter(runbook => {
    const serviceLower = serviceName.toLowerCase();
    const serviceMatch = runbook.tags.some(tag => serviceLower.includes(tag.toLowerCase()));
    const reasonMatch = riskAnalysis.reasons.some(reason => {
      const reasonLower = reason.toLowerCase();
      return runbook.tags.some(tag => reasonLower.includes(tag.toLowerCase()));
    });
    return serviceMatch || reasonMatch;
  });

  let runbooksContext = '';
  if (matchedRunbooks.length > 0) {
    runbooksContext = `\nMatched Reference Runbooks:\n` + matchedRunbooks.map((rb, idx) => 
      `Runbook ${idx + 1}: ${rb.title}\nContent: ${rb.content}`
    ).join('\n\n');
  } else {
    runbooksContext = `\nNo specific matching incident runbooks were found.`;
  }

  const systemPrompt = `You are Sentinel AI, the Predictive DevOps & Deployment Guardian. 
Analyze the release metrics, cross-reference them against any provided reference runbooks, and write a professional, high-impact release risk summary.
Structure your response in markdown format with sections:
- Executive Prediction
- Detailed Risk Breakdown (Memory, Bug, Latency, Historical Outages)
- Runbook & Deployment Verification
- Actionable Recommendation`;

  const userPrompt = `
Analyze release version: ${version} for service: ${serviceName}.${gitCommitContext}
Telemetry and health details:
- Computed Total Risk Score: ${riskAnalysis.totalRisk}%
- Memory Risk Factor: ${riskAnalysis.memoryRisk}/25
- Open Bugs Risk Factor: ${riskAnalysis.bugRisk}/25
- Latency Risk Factor: ${riskAnalysis.latencyRisk}/25
- Historical Outage Similarity: ${riskAnalysis.historicalRisk}/25
- Raw telemetry warnings/flags:
${riskAnalysis.reasons.map(r => `  * ${r}`).join('\n')}

${runbooksContext}

Please generate a deployment guard report based on this telemetry and verify it against the matching runbook guidelines. Explain why the risk score is at ${riskAnalysis.totalRisk}% and outline the best path forward.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, undefined, true);
  const slackText = formatMarkdownForSlack(aiResult.text);

  const riskStatusText = riskAnalysis.totalRisk > 70 ? '🚨 *HIGH RISK*' : riskAnalysis.totalRisk > 40 ? '⚠️ *MEDIUM RISK*' : '✅ *LOW RISK*';

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Release analysis for *${serviceName} ${version}*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔍 *Sentinel AI Release Analysis* for \`${serviceName}\` (\`${version}\`)\n*Status:* ${riskStatusText} | *Risk Score:* \`${riskAnalysis.totalRisk}%\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: slackText
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Delay Deployment 🛑' },
            style: 'danger',
            action_id: 'delay_deploy'
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Deploy to Canary 🧪' },
            style: 'primary',
            action_id: 'canary_deploy'
          }
        ]
      }
    ]
  });
}

async function runExplainOutage(
  query: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  let incidents: any[] = [];
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (isMongoConnected) {
    try {
      incidents = await IncidentModel.find().lean();
    } catch (err) {
      console.error('[Slack runExplainOutage] MongoDB fetch error:', err);
      incidents = db.getIncidents();
    }
  } else {
    incidents = db.getIncidents();
  }

  const searchIncident = incidents.find(inc => 
    inc.rootCause.toLowerCase().includes(query.toLowerCase()) || 
    inc.service.toLowerCase().includes(query.toLowerCase()) ||
    query.toLowerCase().includes('friday') ||
    query.toLowerCase().includes('outage')
  ) || incidents[0] || { _id: 'mock_empty', service: 'checkout-service', rootCause: 'No incidents recorded yet', timeline: ['No logged events found.'], resolution: 'Configure telemetry logs to start analysis.' };

  const systemPrompt = `You are Sentinel AI Incident Time Machine.
Reconstruct the incident timeline based on historical telemetry.
Create a step-by-step chronology showing the start of deployment, initial degradation, cascading failures, root cause analysis, and resolution.
Format in a beautiful markdown list with clear timestamp logs.`;

  const userPrompt = `
Reconstruct the timeline for incident ID ${searchIncident._id} affecting "${searchIncident.service}".
Historical timeline steps:
${(searchIncident.timeline || []).map((t: any) => `- ${t}`).join('\n')}
Root Cause identified: ${searchIncident.rootCause}
Resolution: ${searchIncident.resolution}

Generate an analytical incident autopsy report explaining the cascading failure chain and recommended safeguards to prevent recurrence.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, undefined, true);
  const slackText = formatMarkdownForSlack(aiResult.text);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `⏳ *Sentinel AI Incident Time Machine* - Autopsy for \`${searchIncident.service}\``,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏳ *Sentinel AI Incident Time Machine* - Autopsy for \`${searchIncident.service}\`\n*Root Cause:* ${searchIncident.rootCause}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: slackText
        }
      }
    ]
  });
}

async function runDeploymentAdvice(
  service: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  const systemPrompt = `You are Sentinel AI Release Advisor. Provide tactical deployment strategies (e.g. Canary, Blue-Green, Rolling) and safety checks for the specified service. Use tables or lists in markdown to outline traffic split schedules and expected risk reduction percentages.`;
  const userPrompt = `Provide strategic deployment advice for deploying updates to "${service}". The current environment has memory warnings and a history of database connection pool exhaustion. Provide traffic splits (10%, 25%, 50%, 100%) and validation tests.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, undefined, true);
  const slackText = formatMarkdownForSlack(aiResult.text);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `💡 *Sentinel AI Release Advisor* for \`${service}\``,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💡 *Sentinel AI Release Advisor* for \`${service}\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: slackText
        }
      }
    ]
  });
}

async function runInvestigate(
  service: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  const tickets = db.getJiraTickets().filter(t => t.service === service);
  const metrics = db.getPrometheusMetrics()[service];

  const systemPrompt = `You are Sentinel AI Root Cause Investigator. Your task is to diagnose active anomalies in infrastructure and logs, matching them against known incident patterns.`;
  const userPrompt = `
Investigate the active health state of "${service}".
Active Prometheus telemetry:
- CPU: ${metrics?.cpuUsage || 'N/A'}
- Memory: ${metrics?.memoryUsage || 'N/A'}
- Latency: ${metrics?.latency || 'N/A'}
- Error Rate: ${metrics?.errorRate || 'N/A'}

Active Jira Blocker tickets:
${tickets.map(t => `- [${t.id}] ${t.summary} (${t.priority})`).join('\n')}

Identify the root cause probability, provide specific evidence logs, and list previous matching incident files.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, undefined, true);
  const slackText = formatMarkdownForSlack(aiResult.text);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🛠️ *Sentinel AI Root Cause Analysis* for \`${service}\``,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🛠️ *Sentinel AI Root Cause Analysis* for \`${service}\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: slackText
        }
      }
    ]
  });
}

async function runGeneralChat(
  message: string,
  client: any,
  channel: string,
  threadTs?: string
) {
  const systemPrompt = `You are Sentinel AI, the Predictive DevOps & Deployment Guardian. Help the user with their DevOps queries, release risk checks, or incident autopsies. Be concise, technical, and helpful.`;
  
  const aiResult = await GeminiService.generateContent(message, systemPrompt, undefined, true);
  const slackText = formatMarkdownForSlack(aiResult.text);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: slackText
  });
}
