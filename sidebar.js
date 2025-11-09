// sidebar.js - UI side panel script
// All model work is proxied to the service worker. Do not import transformers in UI pages.

let activePipeline = null; 
let currentModel = 'Xenova/all-MiniLM-L6-v2'; // default embedding model - always defaut damn !!
let currentApiProvider = 'none';
let currentApiKey = '';
let currentMaxOutputTokens = 1024;
let currentOllamaModel = '';
let currentOllamaBaseUrl = 'http://127.0.0.1:11434'; // Default Ollama base URL - finally working 
let db = null;

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kb_db', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('vectors')) {
        const store = database.createObjectStore('vectors', { keyPath: 'id', autoIncrement: true });
        store.createIndex('documentId', 'documentId', { unique: false });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('sourceType', 'sourceType', { unique: false });
      }
    };
  });
}

async function saveVectorEmbedding(documentId, title, sourceType, chunkIndex, chunkText, embedding) {
  //no need for this console but i am keeping it //console.log('Saving vector embedding:', { documentId, title, sourceType, chunkIndex, chunkText, embedding });
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vectors', 'readwrite');
    const store = tx.objectStore('vectors');
    const req = store.add({ documentId, title, sourceType, chunkIndex, chunkText, embedding: new Float32Array(embedding) });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllVectors() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vectors', 'readonly');
    const store = tx.objectStore('vectors');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}


async function initPipeline(modelName) {
  try {
    startLoadingAnimation();
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'init-pipeline', model: modelName }, (response) => {
        resolve(response);
      });
    });
    stopLoadingAnimation();
    if (!res || !res.ok) {
      throw new Error(res && res.error ? res.error : 'Failed to initialize pipeline');
    }
    return true;
  } catch (e) {
    stopLoadingAnimation();
    throw e;
  }
}


async function embed(text) {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'embed', text, model: currentModel }, (response) => {
      resolve(response);
    });
  });
  if (!res) throw new Error('No response from service worker for embed');
  if (!res.ok) throw new Error(res.error || 'Embedding failed');
  return res.embedding;
}

function startLoadingAnimation() {
  const loading = document.getElementById('loadingStatus');
  if (loading) {
    loading.style.display = 'inline';
    let opacity = 1;
    let direction = -0.1;
    loading.blinkInterval = setInterval(() => {
      opacity += direction;
      if (opacity <= 0 || opacity >= 1) direction *= -1;
      loading.style.opacity = opacity;
    }, 100);
  }
}

function stopLoadingAnimation() {
  const loading = document.getElementById('loadingStatus');
  if (loading) {
    clearInterval(loading.blinkInterval);
    loading.style.display = 'none';
    loading.style.opacity = 1;
  }
}

function cleanText(text) {
  let clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  clean = clean.replace(/[\p{Emoji}]/gu, ' ');
  clean = clean.replace(/[^\w\s.,!?-]/g, ' ');
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
}

function chunkText(text, size = 200) {
  const words = text.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(' '));
  }
  return chunks;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function search(queryEmbedding, topK = 3) {
  const vectors = await getAllVectors();
  const scores = vectors.map(v => ({
    title: v.title,
    documentId: v.documentId,
    chunkIndex: v.chunkIndex,
    sourceType: v.sourceType,
    chunkText: v.chunkText,
    score: cosineSimilarity(queryEmbedding, Array.from(v.embedding))
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

function addMessage(role, text) {
  const chat = document.getElementById('chat');
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  msg.textContent = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}


async function ollamaFetch(path, options = {}) {
  let baseUrl = currentOllamaBaseUrl;
  if (!baseUrl) {
    baseUrl = await new Promise(resolve => {
      chrome.storage.local.get(['ollamaBaseUrl'], result => resolve(result.ollamaBaseUrl || 'http://127.0.0.1:11434'));
    });
  }
  const url = baseUrl.replace(/\/$/, '') + path;
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'ollama-proxy', url, options },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error('Service worker error: ' + chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('No response from service worker'));
        } else if (response.ok) {
          resolve(response.body);
        } else {
          reject(new Error(response.body || `HTTP ${response.status}`));
        }
      }
    );
  });
}

async function populateOllamaModels() {
  const ollamaModelSelect = document.getElementById('ollamaModel');
  ollamaModelSelect.innerHTML = '';

  try {
    const data = await ollamaFetch('/api/tags', { method: 'GET' });
    if (data.models && data.models.length > 0) {
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = `${model.name} (Params: ${model.details.parameter_size}, Quant: ${model.details.quantization_level})`;
        ollamaModelSelect.appendChild(option);
      });
      ollamaModelSelect.value = currentOllamaModel;
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No Ollama models found';
      ollamaModelSelect.appendChild(option);
    }
  } catch (error) {
    console.error('Failed to fetch Ollama models:', error);
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Error loading models';
    ollamaModelSelect.appendChild(option);
  }
}

function updateApiOptionsVisibility() {
  const geminiOptions = document.getElementById('geminiOptions');
  const ollamaOptions = document.getElementById('ollamaOptions');

  if (currentApiProvider === 'gemini') {
    geminiOptions.classList.remove('hidden');
    ollamaOptions.classList.add('hidden');
  } else if (currentApiProvider === 'ollama') {
    geminiOptions.classList.add('hidden');
    ollamaOptions.classList.remove('hidden');
  } else {
    geminiOptions.classList.add('hidden');
    ollamaOptions.classList.add('hidden');
  }
}

document.getElementById('updateKB').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.id) {
     
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/Readability.js', 'contentScript.js']
      });

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getText' });
      
      if (response.error) {
        addMessage('assistant', `Extraction Error: ${response.error}`);
        return;
      }

      const { documentId, title, sourceType, text, url } = response;
      
      addMessage('assistant', `Processing content from "${title}"...`);
      
      const chunks = chunkText(text);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const embedding = await embed(chunk);
       
        await saveVectorEmbedding(documentId, title, sourceType, i, chunk, embedding);
      }
      
      addMessage('assistant', `Added ${chunks.length} chunks to knowledge base from "${title}".`);
    } else {
      addMessage('assistant', 'Error: No active tab found or tab ID is invalid.');
    }
  } catch (e) {
    addMessage('assistant', 'Error: ' + e.message);
  }
});

document.getElementById('userInput').addEventListener('keypress', async (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const query = e.target.value.trim();
    e.target.value = '';
    
    addMessage('user', query);
    
    try {
      const queryEmb = await embed(query);
      const results = await search(queryEmb);
      
      const context = results.map(r => `[${r.title} - Chunk ${r.chunkIndex}] ${r.chunkText}`).filter(Boolean).join('\n');
      
      if (currentApiProvider === 'gemini' && currentApiKey) {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Context:\n${context}\n\nQuestion: ${query}`
              }]
            }],
            generationConfig: {
              maxOutputTokens: currentMaxOutputTokens
            }
          })
        });
        const data = await resp.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          addMessage('assistant', data.candidates[0].content.parts[0].text);
        } else {
          addMessage('assistant', 'Error: Could not get a response from Gemini API.');
          console.error('Gemini API Error:', data);
        }
      } else if (currentApiProvider === 'ollama' && currentOllamaModel) {
        const ollamaPrompt = `Context:\n${context}\n\nQuestion: ${query}`;
        const data = await ollamaFetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: currentOllamaModel,
            prompt: ollamaPrompt,
            stream: false,
            keep_alive: 0,
            think: false
          })
        });

        if (data && data.response) {
          addMessage('assistant', 'Assistant: ' + data.response);
        } else if (Array.isArray(data) && data.length > 0 && data[0].response) {
          addMessage('assistant', 'Assistant: ' + data.map(d => d.response).join(''));
        } else {
          addMessage('assistant', 'Error: Empty response from Ollama API.');
        }
      } else {
        addMessage('assistant', `Found ${results.length} relevant chunks. Select an API provider and model in settings for full answers.`);
      }
    } catch (e) {
      addMessage('assistant', 'Error: ' + e.message);
    }
  }
});

document.getElementById('sendBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('userInput');
  if (input.value.trim()) {
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
  }
});

const settingsDialog = document.getElementById('settingsDialog');
document.getElementById('settingsBtn').addEventListener('click', async () => {
  document.querySelector(`input[name="embeddingModel"][value="${currentModel}"]`).checked = true;
  document.querySelector(`input[name="apiProvider"][value="${currentApiProvider}"]`).checked = true;
  document.getElementById('apiKey').value = currentApiKey;
  document.getElementById('maxOutputTokens').value = currentMaxOutputTokens;

  const ollamaBaseUrlInput = document.getElementById('ollamaBaseUrl');
  if (ollamaBaseUrlInput) {
    chrome.storage.local.get(['ollamaBaseUrl'], result => {
      ollamaBaseUrlInput.value = result.ollamaBaseUrl || currentOllamaBaseUrl || 'http://127.0.0.1:11434';
    });
  }

  updateApiOptionsVisibility();

  settingsDialog.showModal();

  document.querySelectorAll('input[name="apiProvider"]').forEach(radio => {
    radio.removeEventListener('change', handleApiProviderChange);
    radio.addEventListener('change', handleApiProviderChange);
  });

  if (currentApiProvider === 'ollama') {
    await populateOllamaModels();
  }
});

async function handleApiProviderChange(event) {
  currentApiProvider = event.target.value;
  updateApiOptionsVisibility();
  if (currentApiProvider === 'ollama') {
    await populateOllamaModels();
  }
}

document.getElementById('saveSettings').addEventListener('click', async () => {
  const selectedEmbeddingModel = document.querySelector('input[name="embeddingModel"]:checked').value;
  if (selectedEmbeddingModel !== currentModel) {
    currentModel = selectedEmbeddingModel;
    try {
     // console.log('Switching embedding model to:', currentModel); 
      await initPipeline(currentModel);
      addMessage('assistant', `Switched embedding model to ${currentModel}. Model files are cached by the browser.`);
     // console.log('Embedding model initialized:', currentModel); 
    } catch (e) {
      addMessage('assistant', 'Error loading embedding model: ' + e.message);
    }
  }

  currentApiProvider = document.querySelector('input[name="apiProvider"]:checked').value;
  currentApiKey = document.getElementById('apiKey').value;
  currentMaxOutputTokens = parseInt(document.getElementById('maxOutputTokens').value, 10);
  currentOllamaModel = document.getElementById('ollamaModel').value;

  if (currentApiProvider === 'ollama') {
    const ollamaBaseUrlInput = document.getElementById('ollamaBaseUrl');
    let ollamaBaseUrl = ollamaBaseUrlInput ? ollamaBaseUrlInput.value.trim() : '';
    if (!ollamaBaseUrl) {
      ollamaBaseUrl = 'http://127.0.0.1:11434';
    }
    currentOllamaBaseUrl = ollamaBaseUrl;
    chrome.storage.local.set({ ollamaBaseUrl: currentOllamaBaseUrl });
  }

  settingsDialog.close();
  addMessage('assistant', 'Settings saved');
});

document.querySelector('[data-close-settings]')?.addEventListener('click', () => {
  settingsDialog.close();
});

async function initialize() {
  db = await openDatabase();
  
  try {
    await initPipeline(currentModel);
    addMessage('assistant', 'Ready');
  } catch (e) {
    addMessage('assistant', 'Error initializing: ' + e.message);
  }
}

initialize();




//extras toast noti -

        window.showToast = function(message, type = 'default') {
            const container = document.getElementById('notification-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
           
            let iconHtml = '';
            if (type === 'success') iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
            else if (type === 'error') iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
            else iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

            toast.innerHTML = `${iconHtml}<span>${message}</span>`;
            
            container.appendChild(toast);

            
            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.3s ease forwards';
                toast.addEventListener('animationend', () => toast.remove());
            }, 3000);
        }