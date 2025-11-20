const modelSelect = document.getElementById('model-select');
const modelStatus = document.getElementById('model-status');
const inferenceSelect = document.getElementById('inference-select');
const inferenceStatus = document.getElementById('inference-status');
const statusText = document.getElementById('status-text');
chrome.runtime.sendMessage({
  action: 'get-settings'
}, response => {
  if (!response) {
    statusText.textContent = 'Could not reach background worker.';
    return;
  }
  modelSelect.innerHTML = '';
  for (const m of response.availableModels) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === response.selectedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  }
  modelStatus.textContent = 'Active: ' + response.selectedModel;
  const selectedInference = response.selectedInference || 'gemini-nano';
  inferenceSelect.value = selectedInference;
  statusText.textContent = 'Connected to background worker.';
});
modelSelect.addEventListener('change', () => {
  const newModel = modelSelect.value;
  modelStatus.textContent = 'Switching model…';
  statusText.textContent = 'Loading new model…';
  chrome.runtime.sendMessage({
    action: 'set-model',
    modelId: newModel
  }, response => {
    if (response && response.success) {
      modelStatus.textContent = 'Active: ' + response.modelId;
      statusText.textContent = 'Model switched successfully.';
    } else {
      modelStatus.textContent = 'Error: ' + (response?.error || 'unknown');
      statusText.textContent = 'Model switch failed.';
    }
  });
});
inferenceSelect.addEventListener('change', () => {
  const newInference = inferenceSelect.value;
  inferenceStatus.textContent = 'Saving preference…';
  chrome.runtime.sendMessage({
    action: 'set-inference',
    inferenceId: newInference
  }, response => {
    if (response && response.success) {
      inferenceStatus.textContent = 'Active: ' + response.inferenceId;
    } else {
      inferenceStatus.textContent = 'Error: ' + (response?.error || 'unknown');
    }
  });
});
