(function () {
  'use strict';
  let sessionCache = null;
  async function ensureSession() {
    if (sessionCache) return sessionCache;
    try {
      if (!self.ai || !self.ai.languageModel) {
        throw new Error('Prompt API not available. Enable chrome://flags/#prompt-api-for-gemini-nano');
      }
      const availability = await self.ai.languageModel.availability({
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
        throw new Error('Gemini Nano is not available on this device.');
      }
      if (availability === 'after-download') {
        console.log('[KnowledgeFox] Gemini Nano model downloading...');
      }
      const params = await self.ai.languageModel.params();
      sessionCache = await self.ai.languageModel.create({
        temperature: params.defaultTemperature * 1.2,
        topK: params.defaultTopK,
        monitor(m) {
          m.addEventListener('downloadprogress', e => {
            console.log(`[KnowledgeFox] Model download: ${(e.loaded * 100).toFixed(1)}%`);
            window.postMessage({
              type: 'KFOX_AI_DOWNLOAD_PROGRESS',
              progress: e.loaded
            }, '*');
          });
        }
      });
      console.log('[KnowledgeFox] Gemini Nano session initialized');
      return sessionCache;
    } catch (err) {
      console.error('[KnowledgeFox] Gemini Nano initialization error:', err);
      throw err;
    }
  }
  async function handlePromptStreaming(requestId, prompt) {
    try {
      const session = await ensureSession();
      const stream = session.promptStreaming(prompt);
      for await (const chunk of stream) {
        window.postMessage({
          type: 'KFOX_AI_RESPONSE_CHUNK',
          requestId,
          chunk
        }, '*');
      }
      window.postMessage({
        type: 'KFOX_AI_RESPONSE_COMPLETE',
        requestId
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'KFOX_AI_RESPONSE_ERROR',
        requestId,
        error: err.message || String(err)
      }, '*');
    }
  }
  async function handlePrompt(requestId, prompt) {
    try {
      const session = await ensureSession();
      const result = await session.prompt(prompt);
      window.postMessage({
        type: 'KFOX_AI_RESPONSE_COMPLETE',
        requestId,
        result
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'KFOX_AI_RESPONSE_ERROR',
        requestId,
        error: err.message || String(err)
      }, '*');
    }
  }
  async function handleCheckAvailability(requestId) {
    try {
      if (!self.ai || !self.ai.languageModel) {
        throw new Error('Prompt API not available');
      }
      const availability = await self.ai.languageModel.availability({
        expectedInputs: [{
          type: 'text',
          languages: ['en']
        }],
        expectedOutputs: [{
          type: 'text',
          languages: ['en']
        }]
      });
      window.postMessage({
        type: 'KFOX_AI_AVAILABILITY_RESPONSE',
        requestId,
        availability
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'KFOX_AI_AVAILABILITY_RESPONSE',
        requestId,
        availability: 'unavailable',
        error: err.message || String(err)
      }, '*');
    }
  }
  function handleDestroySession(requestId) {
    try {
      if (sessionCache) {
        sessionCache.destroy();
        sessionCache = null;
      }
      window.postMessage({
        type: 'KFOX_AI_SESSION_DESTROYED',
        requestId
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'KFOX_AI_RESPONSE_ERROR',
        requestId,
        error: err.message || String(err)
      }, '*');
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const {
      type,
      requestId,
      prompt,
      streaming
    } = event.data;
    if (type === 'KFOX_AI_REQUEST') {
      if (streaming) {
        handlePromptStreaming(requestId, prompt);
      } else {
        handlePrompt(requestId, prompt);
      }
    } else if (type === 'KFOX_AI_CHECK_AVAILABILITY') {
      handleCheckAvailability(requestId);
    } else if (type === 'KFOX_AI_DESTROY_SESSION') {
      handleDestroySession(requestId);
    }
  });
  window.postMessage({
    type: 'KFOX_AI_BRIDGE_READY'
  }, '*');
  console.log('[KnowledgeFox] AI bridge initialized in page context');
})();
