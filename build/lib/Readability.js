/*
 * Copyright (c) 2010 Arc90 Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This code is heavily based on Arc90's readability.js (1.7.1) script
 * available at: http://code.google.com/p/arc90labs-readability
 */

/*
 * Further modifications have been made to this file by Mozilla.
 * These modifications are licensed under the MPL v2.0, or any later version.
 * If a copy of the MPL was not distributed with this file, you can obtain one at
 * http://mozilla.org/MPL/2.0/.
 */

/* jslint browser: true, bitwise: true, strict: true, sub: true, vars: true, undef: true, white: true */
/* global DOMParser, Node, console, window */

"use strict";

const IS_BROWSER = typeof window !== "undefined";

/**
 * Public Readability object.
 * @param {HTMLDocument} document The document to parse.
 * @param {Object} options The options object.
 */
function Readability(document, options) {
  options = options || {};

  this._document = document;
  this._articleState = undefined;
  this._biggestFrame = false;

  // Configuration settings
  this._debug = options.debug || false;
  this._maxElemsToScan = options.maxElemsToScan || 0;
  this._maxNestedElements = options.maxNestedElements || 250;
  this._allowedVideoRegex = options.allowedVideoRegex || /(https?:\/\/(www\.)?(youtube|vimeo|dailymotion|youku|tudou|qq|iqiyi|bilibili)\.com)\/.*(embed|watch|video|play).*/i;

  // Some aspects are controlled by CSS.
  // When running in server environments, this will be null
  this._icap_css = IS_BROWSER ? document.createElementNS("http://www.w3.org/1999/xhtml", "style") : null;
  this._icap_css_added = false;

  // Disable all CSS when parsing, to avoid issues with web pages that remove content with CSS.
  if (IS_BROWSER) {
    this._icap_css.textContent = "body{-webkit-animation:none!important;-webkit-transition:none!important;}\n" +
                                 "iframe{visibility: hidden !important;}\n" +
                                 // The original readability script re-use this CSS for a custom counter
                                 ".grv_use_text_content{-moz-binding: url(\"chrome://global/content/bindings/counter.xml#plain\");}" +
                                 "";
  }

  // Configs
  this._settings = {
    // The number of top candidates to consider when analysing how tight the
    // competition is for the top position.
    DEFAULT_CANDIDATE_TAGS: ["article", "section", "p", "div", "td", "pre", "blockquote", "figure"],
    REGEXPS: {
      // NOTE: These regular expressions are duplicated in
      // `lib.rs` and should be kept in sync.
      unlikelyCandidates: /-ad|-sponsor|-promo|side|combx|related|reside|community|disqus|extra|footer|comments|date|share|article\S{0,4}by|author|social|twitter|facebook|email|media|link|feature|rss|print|inset|zoom|pagination|popup|tools|tweet|like|ads|scroll|login|subscribe|join|regis|form|button|signup|modal/i,
      okMaybeItsACandidate: /and|article|body|column|main|shadow|content|page|post|text|blog|story/i,
      positive: /article|body|content|entry|main|page|post|text|blog|story|haupt/i,
      negative: /hidden|^hid$|com-|contributor|comment|footnote|footer|masthead|media|meta|outbrain|promo|related|scroll|sidebar|sponsor|shopping|shoutbox|taglist|tags|tool|widget|byline|author|agegate|login|signup|share|subscribe|fb|twitter|social|press|news|header|menu/i,
      extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
      byline: /byline|author|dateline|writtenby|p-author/i,
      replaceFonts: /<(\/|dev|span|font|input|button|select|textarea|form|label|link|meta|style)[^>]*?>/gi,
      normalize: /\s+/g,
      decodeEntities: /&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);?/g,
      // NOTE: Each of these parts will be used as a simple `RegExp`
      // For more information about the pattern, see `lib.rs`
      video: {
        youtube: /youtube\.com\/(watch|embed|v|shorts)(\?.*v=|\/)([\w-]{11})/,
        vimeo: /vimeo\.com\/(?:video\/|channels\/[\w]+\/|groups\/[\w]+\/videos\/|album\/\d+\/video\/|)\/?(\d+)/,
        dailymotion: /dailymotion\.com\/(?:video|embed\/video)\/([a-z0-9]+)/,
        youku: /youku\.com\/(?:v_show|embed)\/id_([a-z0-9=]+)/i,
        tudou: /tudou\.com\/(?:v_show|programs\/view|embed)\/([a-z0-9=]+)/i,
        qq: /qq\.com\/x\/cover\/.*\/([a-z0-9]+)\.html/i,
        iqiyi: /iqiyi\.com\/(?:v_)\/(?:[\w]+)\.html/i,
        bilibili: /(?:bilibili\.com\/video\/BV([a-z0-9]+)|b23\.tv\/([a-z0-9]+))/i,
      },
      // Remove any non-alpha-numeric characters, except for spaces and dashes.
      trim: /^\s+|\s+$/g,
      breakBefore: /((^|\n)[\s]*?(<p>|<div class[=\"\']?text[=\"\']?>|<\/li>)[^<]*(<p>|<div|<blockquote|<table|<\/li>[^<]*)*[\s]*?)\n/g,
      // For all text nodes inside title, replace consecutive spaces with a single space.
      // Also remove any leading/trailing spaces.
      normalizeTitleWhitespace: /\s+/g,
      trimTitle: /^\s+|\s+$/g,
      // Check for data URIs in URLs
      dataURIs: /^data:.*$/i,
    },

    // The default number of chars an article must have to be valid
    DEFAULT_MIN_TEXT_LENGTH: 250,

    // The default number of images an article must have to be valid
    DEFAULT_MIN_IMAGE_COUNT: 0,

    // The default number of words a title must have to be valid
    DEFAULT_MIN_WORDS_IN_TITLE: 0,

    // The default level of unlikely filtering
    DEFAULT_UNLIKELY_THRESHOLD: 0.2,

    // The default minimum paragraph length
    DEFAULT_MIN_PARAGRAPH_LENGTH: 50,

    // The default minimum score for a candidate
    DEFAULT_MIN_SCORE: 20,

    // The default minimum number of nodes in a candidate
    DEFAULT_MIN_NODES: 10,

    // The default number of characters to consider for the byline
    DEFAULT_BYLINE_LENGTH: 100,

    // The default maximum number of sibling nodes to consider
    DEFAULT_MAX_SIBLING_LENGTH: 1000,

    // A list of HTML tags that we should never strip from a readability article.
    UNLIKELY_EXEMPT_ATTRS: ["media", "caption"],
    // These are all the elements that have been shown through experience to be
    // good candidates for the domain filtering, but not good candidates for
    // being in the final output.
    DIV_TO_P_ELEMENTS: ["div", "section", "p", "pre", "blockquote", "figure"],
    // These are the HTML elements that Readability will NOT allow in its output.
    // If these elements are encountered, they and their contents will be removed.
    // Set these to empty for a full HTML output (might introduce XSS vulnerabilities)
    REMOVE_INNER_ELEMS_WHITELIST: [
      "a", "audio", "b", "blockquote", "br", "button", "canvas", "cite", "code", "del", "details", "em", "figcaption",
      "figure", "h1", "h2", "h3", "h4", "h5", "h6", "i", "iframe", "img", "ins", "kbd", "li", "main", "mark", "ol",
      "p", "picture", "pre", "q", "s", "samp", "section", "small", "source", "span", "strike", "strong", "sub",
      "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "video"
    ],
  };

  // Default options
  this.options = Object.assign({
    // maxElemsToScan: The maximum number of elements to scan before giving up.
    // Max of 0 means no limit.
    maxElemsToScan: this._maxElemsToScan,

    // maxNestedElements: The maximum number of nested elements to consider.
    // Max of 0 means no limit.
    maxNestedElements: this._maxNestedElements,

    // The base URL to use for resolving relative URLs.
    // Can be passed to the constructor.
    originalURL: null,

    // If given a string, use that as the text content of the document.
    // If null, the Readability will get the text content from the DOM.
    // Can be passed to the constructor.
    textContent: null,

    // An array of regexp to match against for video URLs
    allowedVideoRegex: this._allowedVideoRegex,
  }, options);

  // Custom counter for readability, in addition to the ones that may be set
  // by web pages.
  if (IS_BROWSER) {
    let customCSSText = "";

    customCSSText += "body{-webkit-animation:none!important;-webkit-transition:none!important;}\n";
    customCSSText += "iframe{visibility: hidden !important;}\n";
    // We add the class "grv_use_text_content" to any element that we want to
    // use this custom counter for.
    customCSSText += ".grv_use_text_content{counter-increment: grv_content;}\n";
    customCSSText += ".grv_use_text_content:after{content: counter(grv_content, plain);}\n";
    this._icap_css.textContent = customCSSText;
  }
}

Readability.prototype = {
  /**
   * Runs readability.
   *
   * @return Article object with:
   *   - title
   *   - byline
   *   - dir
   *   - content
   *   - textContent
   *   - length (the text length)
   *   - excerpt
   */
  parse: function() {
    this._cleanContextNode = this._document.body;

    // We cannot have the CSS counter working in a headless environment, so we
    // cannot remove the CSS.
    if (IS_BROWSER) {
      this._document.head.appendChild(this._icap_css);
      this._icap_css_added = true;
    }

    // Attempt to remove any non-text content prior to main parsing.
    // This helps avoid cases where we might find content in an obscure
    // corner of the page after stripping away comments and other elements.
    this._removeUnlikelyCandidates();

    // Loop through all DIVs in the document and remove any elements
    // that look like they're unrelated to the main content.
    this._removeIrrelevantNodes();

    // Now, find the actual good candidates for the article.
    // This process starts by finding all paragraphs, then assigning a score
    // to each paragraph based on its text content and number of children.
    let candidates = this._findCandidates();

    // If we have no candidates, just use the entire body.
    if (candidates.length === 0) {
      let documentClone = this._document.body.cloneNode(true);
      return {
        title: this._getDocumentTitle(),
        byline: null,
        dir: this._getDirection(documentClone),
        content: documentClone,
        textContent: documentClone.textContent,
        length: documentClone.textContent.length,
        excerpt: null,
      };
    }

    let topCandidate = this._selectTopCandidate(candidates);

    let article = this._extractArticle(topCandidate);

    // If we still have an empty article, just use the entire body.
    if (!article.content || article.content.textContent.trim().length === 0) {
      let documentClone = this._document.body.cloneNode(true);
      return {
        title: this._getDocumentTitle(),
        byline: null,
        dir: this._getDirection(documentClone),
        content: documentClone,
        textContent: documentClone.textContent,
        length: documentClone.textContent.length,
        excerpt: null,
      };
    }

    // Now, run through the document and clean up any extraneous elements.
    this._postProcessArticle(article.content);

    // Get the final title, byline, and excerpt.
    article.title = this._getDocumentTitle(article.content);
    article.byline = this._getByline(article.content);
    article.excerpt = this._getExcerpt(article.content);

    // Get the text content and length from the article.
    article.textContent = article.content.textContent;
    article.length = article.textContent.length;
    article.dir = this._getDirection(article.content);

    // If we have an article, but no content, or the content is too small,
    // then we should try again with the whole document.
    if (article.length < this._settings.DEFAULT_MIN_TEXT_LENGTH) {
      let documentClone = this._document.body.cloneNode(true);
      return {
        title: this._getDocumentTitle(),
        byline: null,
        dir: this._getDirection(documentClone),
        content: documentClone,
        textContent: documentClone.textContent,
        length: documentClone.textContent.length,
        excerpt: null,
      };
    }

    return article;
  },

  /**
   * Return the document title.
   * @param {HTMLElement} articleContent The article content to use for the title.
   * @return {string} The document title.
   */
  _getDocumentTitle: function(articleContent) {
    let curTitle = "";
    try {
      curTitle = this._document.title;
    } catch (e) {
      // ignore
    }

    if (articleContent && curTitle === "") {
      let h1 = articleContent.querySelector("h1");
      if (h1) {
        curTitle = h1.textContent;
      }
    }

    if (curTitle === "") {
      curTitle = this._document.querySelector("meta[name='og:title']") ||
                  this._document.querySelector("meta[name='twitter:title']") ||
                  this._document.querySelector("meta[name='headline']");
      if (curTitle) {
        curTitle = curTitle.getAttribute("content");
      }
    }

    if (curTitle === "") {
      let body = this._document.body.textContent;
      // Get the first 100 characters of the body, and use that as the title.
      curTitle = body.substring(0, Math.min(body.length, 100));
    }

    // Remove any newlines or excess whitespace from the title.
    curTitle = curTitle.replace(this._settings.REGEXPS.normalizeTitleWhitespace, " ");
    curTitle = curTitle.replace(this._settings.REGEXPS.trimTitle, "");

    return curTitle;
  },

  /**
   * Get the byline for the article.
   * @param {HTMLElement} articleContent The article content to use for the byline.
   * @return {string} The byline.
   */
  _getByline: function(articleContent) {
    let byline = null;
    try {
      byline = this._document.querySelector("meta[name='byline']") ||
               this._document.querySelector("meta[name='author']");
      if (byline) {
        byline = byline.getAttribute("content");
      }
    } catch (e) {
      // ignore
    }

    // If we still don't have a byline, try to find one in the article content.
    if (!byline && articleContent) {
      let bylineElements = articleContent.querySelectorAll("p, div");
      for (let i = 0; i < bylineElements.length; i++) {
        let text = bylineElements[i].textContent;
        if (text.length > this._settings.DEFAULT_BYLINE_LENGTH) {
          continue;
        }
        if (this._settings.REGEXPS.byline.test(text)) {
          byline = text;
          break;
        }
      }
    }
    return byline;
  },

  /**
   * Get the excerpt for the article.
   * @param {HTMLElement} articleContent The article content to use for the excerpt.
   * @return {string} The excerpt.
   */
  _getExcerpt: function(articleContent) {
    let excerpt = null;
    try {
      excerpt = this._document.querySelector("meta[name='description']") ||
                this._document.querySelector("meta[name='og:description']");
      if (excerpt) {
        excerpt = excerpt.getAttribute("content");
      }
    } catch (e) {
      // ignore
    }

    if (!excerpt && articleContent) {
      let paragraph = articleContent.querySelector("p");
      if (paragraph) {
        excerpt = paragraph.textContent;
      }
    }
    return excerpt;
  },

  /**
   * Get the direction of the text for the article.
   * @param {HTMLElement} articleContent The article content to use for the direction.
   * @return {string} The direction.
   */
  _getDirection: function(articleContent) {
    let dir = null;
    if (articleContent) {
      dir = articleContent.getAttribute("dir");
    }
    if (!dir) {
      dir = this._document.body.getAttribute("dir");
    }
    if (!dir) {
      dir = this._document.documentElement.getAttribute("dir");
    }
    return dir;
  },

  /**
   * Remove any unlikely candidates from the document.
   */
  _removeUnlikelyCandidates: function() {
    let unlikelyCandidates = this._document.querySelectorAll(
      "link[rel='stylesheet'], link[rel='preload'], link[rel='prefetch'], link[rel='prerender'], link[rel='next'], link[rel='prev'], " +
      "script[src], script:not([type]), style, noscript, svg, canvas, nav, footer, header, aside, form, input, button"
    );

    for (let i = 0; i < unlikelyCandidates.length; i++) {
      let node = unlikelyCandidates[i];
      // If it's a script or style tag, just remove it.
      if (node.tagName === "SCRIPT" || node.tagName === "STYLE" || node.tagName === "NOSCRIPT") {
        node.parentNode.removeChild(node);
        continue;
      }
      // If it's a link tag, only remove it if it's not a stylesheet.
      if (node.tagName === "LINK") {
        let rel = node.getAttribute("rel");
        if (rel && rel.toLowerCase() === "stylesheet") {
          continue;
        }
      }
      // Otherwise, check if it's an unlikely candidate.
      if (this._isUnlikelyCandidate(node)) {
        node.parentNode.removeChild(node);
      }
    }
  },

  /**
   * Check if a node is an unlikely candidate.
   * @param {HTMLElement} node The node to check.
   * @return {boolean} True if the node is an unlikely candidate, false otherwise.
   */
  _isUnlikelyCandidate: function(node) {
    let className = node.className;
    let id = node.id;
    return this._settings.REGEXPS.unlikelyCandidates.test(className) ||
           this._settings.REGEXPS.unlikelyCandidates.test(id) &&
           !this._settings.REGEXPS.okMaybeItsACandidate.test(className) &&
           !this._settings.REGEXPS.okMaybeItsACandidate.test(id);
  },

  /**
   * Remove any irrelevant nodes from the document.
   */
  _removeIrrelevantNodes: function() {
    let allElements = this._document.body.querySelectorAll("*");
    for (let i = 0; i < allElements.length; i++) {
      let node = allElements[i];
      let textContent = node.textContent;
      if (textContent.length === 0) {
        // If the node has no text content, check if it has any images.
        // If not, remove it.
        if (node.querySelectorAll("img").length === 0) {
          node.parentNode.removeChild(node);
        }
        continue;
      }
      // If the node is an unlikely candidate, remove it.
      if (this._isUnlikelyCandidate(node)) {
        node.parentNode.removeChild(node);
      }
    }
  },

  /**
   * Find all candidates for the article.
   * @return {Array} An array of candidate nodes.
   */
  _findCandidates: function() {
    let candidates = [];
    let allElements = this._document.querySelectorAll(this._settings.DEFAULT_CANDIDATE_TAGS.join(","));

    for (let i = 0; i < allElements.length; i++) {
      let node = allElements[i];
      // If the node is an unlikely candidate, skip it.
      if (this._isUnlikelyCandidate(node)) {
        continue;
      }

      // If the node has no text content, skip it.
      if (node.textContent.trim().length === 0) {
        continue;
      }

      // If the node has too many children, skip it.
      if (node.children.length > this._settings.DEFAULT_MAX_SIBLING_LENGTH) {
        continue;
      }

      // Calculate the score for the node.
      let score = this._getScore(node);
      candidates.push({
        node: node,
        score: score,
      });
    }
    return candidates;
  },

  /**
   * Get the score for a node.
   * @param {HTMLElement} node The node to score.
   * @return {number} The score.
   */
  _getScore: function(node) {
    let score = 0;
    // Add a score for the tag name.
    score += this._getTagNameScore(node);
    // Add a score for the class name and ID.
    score += this._getClassIdScore(node);
    // Add a score for the text content.
    score += this._getTextContentScore(node);
    return score;
  },

  /**
   * Get the score for a tag name.
   * @param {HTMLElement} node The node to score.
   * @return {number} The score.
   */
  _getTagNameScore: function(node) {
    let score = 0;
    switch (node.tagName) {
      case "ARTICLE":
        score += 10;
        break;
      case "SECTION":
        score += 8;
        break;
      case "DIV":
        score += 5;
        break;
      case "P":
        score += 3;
        break;
      case "TD":
        score += 3;
        break;
      case "PRE":
        score += 3;
        break;
      case "BLOCKQUOTE":
        score += 3;
        break;
      case "FIGURE":
        score += 3;
        break;
    }
    return score;
  },

  /**
   * Get the score for a class name and ID.
   * @param {HTMLElement} node The node to score.
   * @return {number} The score.
   */
  _getClassIdScore: function(node) {
    let score = 0;
    let className = node.className;
    let id = node.id;
    if (this._settings.REGEXPS.positive.test(className) ||
        this._settings.REGEXPS.positive.test(id)) {
      score += 5;
    }
    if (this._settings.REGEXPS.negative.test(className) ||
        this._settings.REGEXPS.negative.test(id)) {
      score -= 5;
    }
    return score;
  },

  /**
   * Get the score for text content.
   * @param {HTMLElement} node The node to score.
   * @return {number} The score.
   */
  _getTextContentScore: function(node) {
    let score = 0;
    let textContent = node.textContent;
    let wordCount = textContent.split(" ").length;
    // Add 1 point for every 100 words.
    score += Math.floor(wordCount / 100);
    // Add 1 point for every 10 children.
    score += Math.floor(node.children.length / 10);
    return score;
  },

  /**
   * Select the top candidate for the article.
   * @param {Array} candidates An array of candidate nodes.
   * @return {HTMLElement} The top candidate node.
   */
  _selectTopCandidate: function(candidates) {
    // Sort the candidates by score.
    candidates.sort((a, b) => b.score - a.score);

    let topCandidate = candidates[0];
    return topCandidate.node;
  },

  /**
   * Extract the article from the top candidate.
   * @param {HTMLElement} topCandidate The top candidate node.
   * @return {Object} The article object.
   */
  _extractArticle: function(topCandidate) {
    let articleContent = topCandidate.cloneNode(true);
    return {
      content: articleContent,
    };
  },

  /**
   * Post-process the article.
   * @param {HTMLElement} articleContent The article content to post-process.
   */
  _postProcessArticle: function(articleContent) {
    // Remove any elements that are not in the whitelist.
    let allElements = articleContent.querySelectorAll("*");
    for (let i = 0; i < allElements.length; i++) {
      let node = allElements[i];
      if (this._settings.REMOVE_INNER_ELEMS_WHITELIST.indexOf(node.tagName.toLowerCase()) === -1) {
        node.parentNode.removeChild(node);
      }
    }

    // Convert any div tags to p tags if they only contain text.
    let divElements = articleContent.querySelectorAll("div");
    for (let i = 0; i < divElements.length; i++) {
      let node = divElements[i];
      if (node.children.length === 0 && node.textContent.trim().length > 0) {
        let p = this._document.createElement("p");
        p.textContent = node.textContent;
        node.parentNode.replaceChild(p, node);
      }
    }
  },
};

if (typeof module === "object" && module.exports) {
  module.exports = Readability;
} else if (IS_BROWSER) {
  window.Readability = Readability;
}