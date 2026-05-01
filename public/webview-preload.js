/**
 * Preload script for webview content
 * This runs in the webview context to communicate with the main process
 */

(function() {
  'use strict';

  console.log('[AI Workbench] Webview preload loaded');

  // Notify parent that webview is ready
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'webview-ready', url: window.location.href }, '*');
    } catch (e) {
      console.error('[AI Workbench] Failed to notify parent:', e);
    }
  }

  // Listen for messages from parent (renderer process)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ai-workbench-command') {
      console.log('[AI Workbench] Received command:', event.data.command);
      
      switch (event.data.command) {
        case 'get-content':
          // Extract page content
          const content = document.body.innerText;
          event.source.postMessage({ 
            type: 'ai-workbench-response', 
            id: event.data.id,
            data: content 
          }, event.origin);
          break;
          
        case 'inject-prompt':
          // Try to find and fill input elements
          const prompt = event.data.prompt;
          const provider = event.data.provider;
          
          // Provider-specific injection logic
          injectPrompt(provider, prompt);
          break;
          
        default:
          console.log('[AI Workbench] Unknown command:', event.data.command);
      }
    }
  });

  /**
   * Inject prompt into AI provider interface
   */
  function injectPrompt(provider, prompt) {
    console.log('[AI Workbench] Injecting prompt for', provider);
    
    // Common input selectors
    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="ask"]',
      'textarea[placeholder*="chat"]',
      'textarea[placeholder*="输入"]',
      'textarea[placeholder*="傳訊"]',
      '[contenteditable="true"]',
      'textarea',
      'input[type="text"]'
    ];
    
    let inputElement = null;
    
    // Try each selector
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        inputElement = el;
        break;
      }
    }
    
    if (inputElement) {
      // Set the value
      if (inputElement.isContentEditable) {
        inputElement.textContent = prompt;
      } else {
        inputElement.value = prompt;
      }
      
      // Trigger input events
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Focus the element
      inputElement.focus();
      
      console.log('[AI Workbench] Prompt injected successfully');
    } else {
      console.error('[AI Workbench] Could not find input element');
    }
  }
  
  /**
   * Check if element is visible
   */
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           el.offsetHeight > 0;
  }

  // Expose API for debugging
  window.aiWorkbenchWebview = {
    version: '0.3.0',
    injectPrompt,
    getContent: () => document.body.innerText
  };

})();
