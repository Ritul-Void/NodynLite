
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getText') {
    let documentClone = document.cloneNode(true);
    let documentLocation = document.location;
    let documentDomain = document.domain;


    const obviousNoiseSelectors = [
      'script', 'style', 'noscript', 'svg', 'canvas', 'nav', 'footer',
      'header', 'aside', 'form', 'input', 'button', 'iframe' // Added iframe as well
    ];
    obviousNoiseSelectors.forEach(selector => {
      documentClone.querySelectorAll(selector).forEach(el => el.remove());
    });

 
    let article = new Readability(documentClone).parse();

    if (!article || !article.textContent) {
      sendResponse({ error: 'Could not extract meaningful content from the page.' });
      return true;
    }

 
    let cleanTextContent = article.textContent;
    cleanTextContent = cleanTextContent.replace(/\s+/g, ' '); // Collapse multiple spaces
    cleanTextContent = cleanTextContent.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n'); // Collapse newlines, trim lines, remove empty lines


    const documentId = crypto.randomUUID();

  
    sendResponse({
      documentId: documentId,
      sourceType: "generic-web",
      domain: documentDomain,
      title: article.title || document.title,
      byline: article.byline,
      text: cleanTextContent,
      length: cleanTextContent.length,
      excerpt: article.excerpt,
      url: documentLocation.href
    });
  }
  return true;
});