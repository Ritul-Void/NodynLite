import { Readability } from '@mozilla/readability';
function getPageText() {
  const clone = document.cloneNode(true);
  const reader = new Readability(clone);
  const article = reader.parse();
  return article ? article.textContent : document.body.innerText;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract-text') {
    try {
      const text = getPageText();
      sendResponse({
        success: true,
        text,
        origin: location.origin
      });
    } catch (err) {
      sendResponse({
        success: false,
        error: err.message
      });
    }
    return true;
  }
});
