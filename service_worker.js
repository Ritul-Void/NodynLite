// service_worker.js - MV3 service worker (module)
// 
// REMOTE MODEL & WASM LOADING:
// This service worker uses transformers.js to load models and WASM files directly from
// the Hugging Face CDN. No local WASM files or model files need to be included in the
// extension package. All required binaries are fetched automatically at runtime.
//
// The env configuration below ensures:
// - Models are loaded from remote CDN (not from extension files)
// - WASM binaries are fetched automatically from CDN
// - Downloaded files are cached in the browser cache for performance
// - No web workers are spawned (runs directly in service worker context)
//finally working so no need for further todo ok fuck

import { pipeline, env } from '@huggingface/transformers';


env.allowLocalModels = false;    
env.allowRemoteModels = true;    
env.useBrowserCache = true;  
env.allowWebWorkers = false;  


class PipelineSingleton {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  
  static async getInstance(modelName = null, progress_callback = null) {
    if (!this.instance) {
      const modelToLoad = modelName || this.model;
     
      this.instance = await pipeline(this.task, modelToLoad, {
        quantized: true,
        progress_callback: (data) => {
          if (progress_callback) progress_callback(data);
         
          try {
            chrome.runtime.sendMessage({ type: 'pipeline-progress', data });
          } catch (e) {
            
          }
        }
      });
    }
    return this.instance;
  }
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'ollama-proxy') {
    (async () => {
      try {
        const { url, options } = message;
        const resp = await fetch(url, options);
        const contentType = resp.headers.get('content-type') || '';
        let body;
        if (contentType.includes('application/json')) {
          body = await resp.json();
        } else {
          body = await resp.text();
        }
        sendResponse({ ok: resp.ok, status: resp.status, body });
      } catch (e) {
        sendResponse({ ok: false, status: 500, body: e.message });
      }
    })();
    return true;
  }


  if (message.type === 'init-pipeline') {
    (async () => {
      try {
        const modelName = message.model || PipelineSingleton.model;
        await PipelineSingleton.getInstance(modelName, (progress) => {
         
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

 
  if (message.type === 'embed') {
    (async () => {
      try {
        const modelName = message.model || PipelineSingleton.model;
        console.log('Using embedding model:', modelName); 
        const model = await PipelineSingleton.getInstance(modelName);

        const result = await model(message.text, { pooling: 'mean', normalize: true });
        
        let arr = [];
        if (result && result.data) {
          arr = Array.from(result.data);
        } else if (Array.isArray(result)) {
         
          arr = result.flat ? result.flat() : result;
        }
      
        sendResponse({ ok: true, embedding: arr });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  
});