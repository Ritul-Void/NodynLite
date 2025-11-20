import { pipeline, cos_sim } from '@huggingface/transformers';
import { storeVectors, getVectorsByOrigin, clearVectorsByOrigin, setSetting, getSetting } from './db.js';
import { chunkText } from './chunker.js';
const AVAILABLE_MODELS = {
  'Xenova/all-MiniLM-L6-v2': {
    task: 'feature-extraction',
    label: 'MiniLM-L6-v2'
  },
  'Xenova/gte-small': {
    task: 'feature-extraction',
    label: 'GTE-small'
  }
};
const SUMMARIZATION_MODELS = {
  'Xenova/t5-small': {
    task: 'summarization',
    label: 'T5-small'
  },
  'Xenova/distilbart-cnn-6-6': {
    task: 'summarization',
    label: 'DistilBART-CNN-6-6'
  }
};
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
class PipelineSingleton {
  static task = 'feature-extraction';
  static model = DEFAULT_MODEL;
  static instance = null;
  static async getInstance(progress_callback = null) {
    const savedModel = await getSetting('selectedModel');
    const target = savedModel || DEFAULT_MODEL;
    if (this.model !== target || !this.instance) {
      this.model = target;
      this.task = AVAILABLE_MODELS[target]?.task || 'feature-extraction';
      this.instance = pipeline(this.task, this.model, {
        progress_callback
      });
    }
    return this.instance;
  }
  static async switchModel(modelId) {
    this.model = modelId;
    this.task = AVAILABLE_MODELS[modelId]?.task || 'feature-extraction';
    this.instance = null;
    await setSetting('selectedModel', modelId);
  }
}
const embedText = async text => {
  let model = await PipelineSingleton.getInstance(data => {});
  let result = await model(text, {
    pooling: 'mean',
    normalize: true
  });
  return result;
};
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: 'classify-selection',
    title: 'Classify "%s"',
    contexts: ['selection']
  });
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(console.error);
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'classify-selection' || !info.selectionText) return;
  let result = await embedText(info.selectionText);
  chrome.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    args: [result],
    function: result => {
      console.log('result', result);
      console.log('document', document);
    }
  });
});
chrome.contextMenus.create({
  id: 'summarize-selection',
  title: 'Summarize selected text',
  contexts: ['selection']
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'summarize-selection' && info.selectionText) {
    const sidePanelTarget = {
      tabId: tab.id
    };
    try {
      await chrome.runtime.sendMessage({
        action: 'summarize-selected-text',
        text: info.selectionText
      });
    } catch (err) {
      console.log('Could not send to side panel:', err);
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('sender', sender);
  if (message.action === 'classify') {
    (async function () {
      let result = await embedText(message.text);
      sendResponse(result);
    })();
    return true;
  }
  if (message.action === 'embed-chunks') {
    (async function () {
      try {
        const {
          origin,
          chunks
        } = message;
        const records = [];
        for (const chunk of chunks) {
          const result = await embedText(chunk.text);
          records.push({
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            embedding: Array.from(result.data)
          });
        }
        await storeVectors(origin, records);
        sendResponse({
          success: true,
          count: records.length
        });
      } catch (err) {
        console.error('embed-chunks error', err);
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'query-vectors') {
    (async function () {
      try {
        const {
          origin,
          query,
          topK
        } = message;
        const queryEmbedding = await embedText(query);
        const queryArr = Array.from(queryEmbedding.data);
        const stored = await getVectorsByOrigin(origin);
        if (!stored.length) {
          sendResponse({
            success: true,
            results: [],
            message: 'No vectors stored for this site.'
          });
          return;
        }
        const scored = stored.map(v => ({
          text: v.text,
          chunkIndex: v.chunkIndex,
          score: cos_sim(queryArr, v.embedding)
        }));
        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, topK || 5);
        sendResponse({
          success: true,
          results
        });
      } catch (err) {
        console.error('query-vectors error', err);
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'clear-vectors') {
    (async function () {
      try {
        await clearVectorsByOrigin(message.origin);
        sendResponse({
          success: true
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'get-model-info') {
    (async function () {
      const savedModel = await getSetting('selectedModel');
      const modelId = savedModel || DEFAULT_MODEL;
      sendResponse({
        modelId,
        label: AVAILABLE_MODELS[modelId]?.label || modelId,
        availableModels: Object.entries(AVAILABLE_MODELS).map(([id, m]) => ({
          id,
          label: m.label
        }))
      });
    })();
    return true;
  }
  if (message.action === 'set-model') {
    (async function () {
      try {
        await PipelineSingleton.switchModel(message.modelId);
        sendResponse({
          success: true,
          modelId: message.modelId
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'get-settings') {
    (async function () {
      const selectedModel = (await getSetting('selectedModel')) || DEFAULT_MODEL;
      const selectedInference = (await getSetting('selectedInference')) || 'gemini-nano';
      const selectedSummarization = (await getSetting('selectedSummarization')) || 'gemini-nano';
      sendResponse({
        selectedModel,
        selectedInference,
        selectedSummarization,
        availableModels: Object.entries(AVAILABLE_MODELS).map(([id, m]) => ({
          id,
          label: m.label
        }))
      });
    })();
    return true;
  }
  if (message.action === 'set-inference') {
    (async function () {
      try {
        await setSetting('selectedInference', message.inferenceId);
        sendResponse({
          success: true,
          inferenceId: message.inferenceId
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'set-summarization-model') {
    (async function () {
      try {
        await setSetting('selectedSummarization', message.modelId);
        sendResponse({
          success: true,
          modelId: message.modelId
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'summarize-text') {
    (async function () {
      try {
        const {
          text,
          model
        } = message;
        const modelId = model === 't5-small' ? 'Xenova/t5-small' : 'Xenova/distilbart-cnn-6-6';
        let summarizer = await pipeline('summarization', modelId);
        const result = await summarizer(text, {
          max_length: 100
        });
        sendResponse({
          success: true,
          summary: result[0].summary_text
        });
      } catch (err) {
        console.error('summarize-text error', err);
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'ingest-page') {
    (async function () {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (!tab || !tab.id) {
          sendResponse({
            success: false,
            error: 'No active tab found.'
          });
          return;
        }
        const extraction = await chrome.tabs.sendMessage(tab.id, {
          action: 'extract-text'
        });
        if (!extraction || !extraction.success) {
          sendResponse({
            success: false,
            error: extraction?.error || 'Text extraction failed.'
          });
          return;
        }
        const {
          text,
          origin
        } = extraction;
        if (!text || text.trim().length < 20) {
          sendResponse({
            success: false,
            error: 'Not enough text on this page.'
          });
          return;
        }
        const chunks = chunkText(text);
        const records = [];
        for (const chunk of chunks) {
          const result = await embedText(chunk.text);
          records.push({
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            embedding: Array.from(result.data)
          });
        }
        await storeVectors(origin, records);
        sendResponse({
          success: true,
          count: records.length,
          origin
        });
      } catch (err) {
        console.error('ingest-page error', err);
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
  if (message.action === 'get-active-origin') {
    (async function () {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (tab && tab.url) {
          const url = new URL(tab.url);
          sendResponse({
            success: true,
            origin: url.origin,
            url: tab.url,
            title: tab.title
          });
        } else {
          sendResponse({
            success: false,
            error: 'No active tab.'
          });
        }
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
    })();
    return true;
  }
});
