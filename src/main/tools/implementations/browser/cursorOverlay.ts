/**
 * Cursor overlay helper for visual feedback during agent actions
 */

export async function showCursorOverlay(
  webContents: Electron.WebContents,
  x: number,
  y: number,
  _action: 'click' | 'type' | 'hover' = 'click'
): Promise<void> {
  await webContents.executeJavaScript(`
    (() => {
      // Remove existing cursor if any
      const existing = document.getElementById('agent-cursor-overlay');
      if (existing) existing.remove();
      
      // Create cursor element
      const cursor = document.createElement('div');
      cursor.id = 'agent-cursor-overlay';
      cursor.style.cssText = \`
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 20px;
        height: 20px;
        pointer-events: none;
        z-index: 999999;
        opacity: 0;
        transform: translate(-10px, -10px) scale(0.8);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      \`;
      
      // Create cursor SVG (pointer)
      cursor.innerHTML = \`
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="#07285D" stroke="white" stroke-width="1.5"/>
        </svg>
      \`;
      
      document.body.appendChild(cursor);
      
      // Animate cursor appearance
      requestAnimationFrame(() => {
        cursor.style.opacity = '1';
        cursor.style.transform = 'translate(-10px, -10px) scale(1)';
      });
    })();
  `);
}

export async function animateClick(
  webContents: Electron.WebContents,
  x: number,
  y: number
): Promise<void> {
  await webContents.executeJavaScript(`
    (() => {
      const cursor = document.getElementById('agent-cursor-overlay');
      if (!cursor) return;
      
      // Add ripple animation styles if not already added
      let style = document.getElementById('agent-cursor-styles');
      if (!style) {
        style = document.createElement('style');
        style.id = 'agent-cursor-styles';
        style.textContent = \`
          @keyframes ripple {
            0% {
              width: 0;
              height: 0;
              opacity: 0.6;
            }
            100% {
              width: 60px;
              height: 60px;
              opacity: 0;
            }
          }
          @keyframes cursorClick {
            0%, 100% {
              transform: translate(-10px, -10px) scale(1);
            }
            50% {
              transform: translate(-10px, -10px) scale(0.8);
            }
          }
        \`;
        document.head.appendChild(style);
      }
      
      // Create click ripple effect
      const ripple = document.createElement('div');
      ripple.style.cssText = \`
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(7, 40, 93, 0.3);
        pointer-events: none;
        z-index: 999998;
        transform: translate(-50%, -50%);
        animation: ripple 0.6s ease-out;
      \`;
      
      document.body.appendChild(ripple);
      
      // Animate cursor click
      cursor.style.animation = 'cursorClick 0.3s ease-out';
      
      // Clean up ripple after animation
      setTimeout(() => {
        ripple.remove();
        cursor.style.animation = '';
      }, 600);
    })();
  `);
}

export async function animateType(
  webContents: Electron.WebContents,
  x: number,
  y: number,
  text: string
): Promise<void> {
  const displayText = text.length > 20 ? text.substring(0, 20) + '...' : text;
  await webContents.executeJavaScript(`
    (() => {
      const cursor = document.getElementById('agent-cursor-overlay');
      if (!cursor) return;
      
      // Show typing indicator
      const typingIndicator = document.createElement('div');
      typingIndicator.style.cssText = \`
        position: fixed;
        left: ${x + 15}px;
        top: ${y - 10}px;
        background: rgba(7, 40, 93, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        pointer-events: none;
        z-index: 999999;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        opacity: 0;
        transition: opacity 0.2s;
      \`;
      typingIndicator.textContent = 'Typing: "${displayText}"';
      document.body.appendChild(typingIndicator);
      
      // Fade in
      requestAnimationFrame(() => {
        typingIndicator.style.opacity = '1';
      });
      
      // Remove after a moment
      setTimeout(() => {
        typingIndicator.style.opacity = '0';
        setTimeout(() => typingIndicator.remove(), 200);
      }, 1000);
    })();
  `);
}

export async function hideCursorOverlay(webContents: Electron.WebContents): Promise<void> {
  await webContents.executeJavaScript(`
    (() => {
      const cursor = document.getElementById('agent-cursor-overlay');
      if (cursor) {
        cursor.style.opacity = '0';
        cursor.style.transform = 'translate(-10px, -10px) scale(0.8)';
        setTimeout(() => cursor.remove(), 300);
      }
    })();
  `);
}

