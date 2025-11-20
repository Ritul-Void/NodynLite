const originBar = document.getElementById('kfox-origin-bar');
const statusEl = document.getElementById('kfox-status');
const chatEl = document.getElementById('kfox-chat');
const inputEl = document.getElementById('kfox-input');
const sendBtn = document.getElementById('kfox-send-btn');
const btnIngest = document.getElementById('kfox-btn-ingest');
const btnClear = document.getElementById('kfox-btn-clear');
const btnInfo = document.getElementById('kfox-btn-info');
const btnSettings = document.getElementById('kfox-btn-settings');
const settingsPanel = document.getElementById('kfox-settings');
const modelSelect = document.getElementById('kfox-model-select');
const inferenceSelect = document.getElementById('kfox-inference-select');
const summarizationSelect = document.getElementById('kfox-summarization-select');
let currentOrigin = '';
let currentTitle = '';
let lastRetrievedChunks = [];
let pendingSummarizeText = '';
let geminiSession = null;
async function getLanguageModelAPI() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (self.ai && self.ai.languageModel) return self.ai.languageModel;
  return null;
}
async function ensureGeminiSession() {
  if (geminiSession) return geminiSession;
  const LM = await getLanguageModelAPI();
  if (!LM) {
    throw new Error('Prompt API not available. Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
  }
  const availability = await LM.availability({
    expectedInputs: [{
      type: 'text',
      languages: ['en']
    }],
    expectedOutputs: [{
      type: 'text',
      languages: ['en']
    }]
  });
  if (availability === 'unavailable') {
    throw new Error('Gemini Nano is unavailable on this device.');
  }
  if (availability === 'after-download' || availability === 'downloading') {
    setStatus('<span class="kfox-spinner"></span>Downloading Gemini Nano model\u2026');
  }
  const params = await LM.params();
  geminiSession = await LM.create({
    temperature: Math.min(params.defaultTemperature * 1.2, params.maxTemperature),
    topK: params.defaultTopK,
    monitor(m) {
      m.addEventListener('downloadprogress', e => {
        setStatus('<span class="kfox-spinner"></span>Downloading model: ' + (e.loaded * 100).toFixed(0) + '%');
      });
    }
  });
  setStatus('Gemini Nano ready.');
  return geminiSession;
}
function destroyGeminiSession() {
  if (geminiSession) {
    geminiSession.destroy();
    geminiSession = null;
  }
}
async function updateCurrentOrigin() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'get-active-origin'
    });
    if (response && response.success) {
      currentOrigin = response.origin;
      currentTitle = response.title || '';
      originBar.textContent = currentTitle ? currentTitle + ' \u2014 ' + currentOrigin : currentOrigin;
    } else {
      currentOrigin = '';
      currentTitle = '';
      originBar.textContent = 'No page active';
    }
  } catch (err) {
    currentOrigin = '';
    originBar.textContent = 'No page active';
  }
}
chrome.tabs.onActivated.addListener(() => updateCurrentOrigin());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') updateCurrentOrigin();
});
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'get-settings'
    });
    if (!response) return;
    modelSelect.innerHTML = '';
    for (const m of response.availableModels) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === response.selectedModel) opt.selected = true;
      modelSelect.appendChild(opt);
    }
    inferenceSelect.value = response.selectedInference || 'gemini-nano';
    summarizationSelect.value = response.selectedSummarization || 'gemini-nano';
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}
btnSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('kfox-hidden');
  btnSettings.classList.toggle('kfox-active');
});
modelSelect.addEventListener('change', async () => {
  const newModel = modelSelect.value;
  setStatus('Switching embedding model\u2026');
  const response = await chrome.runtime.sendMessage({
    action: 'set-model',
    modelId: newModel
  });
  if (response && response.success) {
    setStatus('Embedding model: ' + response.modelId);
  } else {
    setStatus('Error switching model: ' + (response?.error || 'unknown'));
  }
});
inferenceSelect.addEventListener('change', async () => {
  const newInference = inferenceSelect.value;
  await chrome.runtime.sendMessage({
    action: 'set-inference',
    inferenceId: newInference
  });
  destroyGeminiSession();
});
summarizationSelect.addEventListener('change', async () => {
  const newSummarization = summarizationSelect.value;
  await chrome.runtime.sendMessage({
    action: 'set-summarization-model',
    modelId: newSummarization
  });
});
btnIngest.addEventListener('click', async () => {
  if (!currentOrigin) {
    setStatus('No active page to ingest.');
    return;
  }
  setStatus('<span class="kfox-spinner"></span>Ingesting page\u2026');
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'ingest-page'
    });
    if (response && response.success) {
      setStatus('\u2713 Ingested ' + response.count + ' chunks for ' + response.origin);
      appendMsg('bot', 'Page ingested \u2014 ' + response.count + ' chunks embedded and stored.');
    } else {
      setStatus('\u2717 ' + (response?.error || 'Ingestion failed.'));
      appendMsg('bot', 'Ingestion failed: ' + (response?.error || 'unknown error'));
    }
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});
btnClear.addEventListener('click', async () => {
  if (!currentOrigin) {
    setStatus('No active page.');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'clear-vectors',
      origin: currentOrigin
    });
    if (response && response.success) {
      setStatus('Vectors cleared for ' + currentOrigin);
      chatEl.innerHTML = '';
      appendMsg('bot', 'Chat and vectors cleared for this site.');
    } else {
      setStatus('Error: ' + (response?.error || 'unknown'));
    }
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});
btnInfo.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'get-model-info'
    });
    if (response) {
      showToast('Embedding: ' + response.label + '  |  Inference: Gemini Nano');
    }
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});
async function submitQuery() {
  const query = inputEl.value.trim();
  if (!query) return;
  if (!currentOrigin) {
    appendMsg('bot', 'No active page. Navigate to a page first.');
    return;
  }
  appendMsg('user', query);
  inputEl.value = '';
  setStatus('<span class="kfox-spinner"></span>Searching\u2026');
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'query-vectors',
      origin: currentOrigin,
      query,
      topK: 5
    });
    if (!response || !response.success) {
      appendMsg('bot', 'Error: ' + (response?.error || 'unknown'));
      setStatus('Query failed.');
      return;
    }
    if (response.results.length === 0) {
      appendMsg('bot', response.message || 'No results found. Ingest the page first.');
      setStatus('No results.');
      return;
    }
    lastRetrievedChunks = response.results;
    setStatus('<span class="kfox-spinner"></span>Generating answer\u2026');
    const context = lastRetrievedChunks.map((chunk, idx) => '[' + (idx + 1) + '] ' + chunk.text).join('\n\n');
    const prompt = 'You are a helpful assistant. Answer the user\'s question based on the following context from the current webpage. ' + 'If the answer is in the context, cite the source using [N] notation.\n\n' + 'Context:\n' + context + '\n\n' + 'User question: ' + query + '\n\n' + 'Answer:';
    try {
      const session = await ensureGeminiSession();
      const stream = session.promptStreaming(prompt);
      const answerEl = appendMsg('bot', '');
      let fullAnswer = '';
      for await (const chunk of stream) {
        fullAnswer += chunk;
        answerEl.textContent = fullAnswer;
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      appendCitationPills(lastRetrievedChunks);
      setStatus('Answer generated with ' + lastRetrievedChunks.length + ' citations.');
    } catch (err) {
      console.error('Gemini Nano error:', err);
      appendMsg('bot', 'Inference error: ' + err.message);
      setStatus('Inference failed. Showing citations only.');
      appendCitationPills(lastRetrievedChunks);
    }
  } catch (err) {
    appendMsg('bot', 'Error: ' + err.message);
    setStatus('Query failed.');
  }
}
sendBtn.addEventListener('click', submitQuery);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitQuery();
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'summarize-selected-text') {
    pendingSummarizeText = message.text;
    appendMsg('user', '[Selected text for summarization]');
    appendMsg('bot', 'Text copied to summarization. Processing...');
    performSummarization(message.text);
    sendResponse({
      success: true
    });
  }
});
function setStatus(html) {
  statusEl.innerHTML = html;
}
function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'kfox-msg kfox-' + role;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}
function appendCitationPills(chunks) {
  const container = document.createElement('div');
  container.className = 'kfox-citations';
  chunks.forEach((chunk, idx) => {
    const pill = document.createElement('span');
    pill.className = 'kfox-citation-pill';
    pill.textContent = '[' + (idx + 1) + ']';
    pill.tabIndex = 0;
    const tooltip = document.createElement('div');
    tooltip.className = 'kfox-citation-tooltip';
    const snippetText = chunk.text.length > 300 ? chunk.text.slice(0, 300) + '\u2026' : chunk.text;
    tooltip.innerHTML = '<div class="kfox-tooltip-header">' + '<strong>Citation ' + (idx + 1) + '</strong>' + '<span class="kfox-tooltip-score">Score: ' + chunk.score.toFixed(3) + '</span>' + '</div>' + '<div class="kfox-tooltip-text">' + escapeHtml(snippetText) + '</div>' + '<div class="kfox-tooltip-meta">Chunk #' + (chunk.chunkIndex != null ? chunk.chunkIndex : idx) + '</div>';
    pill.appendChild(tooltip);
    container.appendChild(pill);
  });
  chatEl.appendChild(container);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function showToast(text) {
  let toast = document.querySelector('.kfox-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'kfox-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('kfox-show');
  setTimeout(() => toast.classList.remove('kfox-show'), 3500);
}
async function performSummarization(text) {
  const model = summarizationSelect.value;
  setStatus('<span class="kfox-spinner"></span>Summarizing...');
  try {
    if (model === 'gemini-nano') {
      const session = await ensureGeminiSession();
      const prompt = 'Summarize the following text in 2-3 sentences:\n\n' + text;
      const stream = session.promptStreaming(prompt);
      const summaryEl = appendMsg('bot', '');
      let fullSummary = '';
      for await (const chunk of stream) {
        fullSummary += chunk;
        summaryEl.textContent = fullSummary;
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      setStatus('Summarization complete.');
    } else {
      const response = await chrome.runtime.sendMessage({
        action: 'summarize-text',
        text,
        model
      });
      if (response && response.success) {
        appendMsg('bot', response.summary);
        setStatus('Summarization complete.');
      } else {
        appendMsg('bot', 'Error: ' + (response?.error || 'Summarization failed'));
        setStatus('Summarization failed.');
      }
    }
  } catch (err) {
    console.error('Summarization error:', err);
    appendMsg('bot', 'Error: ' + err.message);
    setStatus('Summarization failed.');
  }
}
(async function init() {
  await updateCurrentOrigin();
  await loadSettings();
})();
