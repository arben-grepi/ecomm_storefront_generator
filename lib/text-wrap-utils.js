/**
 * Text Wrapping Utilities
 * Prevents awkward line breaks by ensuring at least 2-3 words stay together
 */

/**
 * Process text to prevent orphaned words on new lines
 * Rule: Always keep at least 2 words together on a new line
 * 
 * @param {string} text - The text to process
 * @returns {string} - Text with non-breaking spaces inserted appropriately
 */
export function preventOrphanedWords(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Split text into words
  const words = text.trim().split(/\s+/);
  
  if (words.length <= 2) {
    // If 2 or fewer words, join with non-breaking space
    return words.join('\u00A0'); // \u00A0 is non-breaking space
  }
  
  // Always keep the last 2 words together with non-breaking spaces
  const before = words.slice(0, -2);
  const lastTwoWords = words.slice(-2);
  
  // Join the last 2 words with non-breaking space
  const joinedLastWords = lastTwoWords.join('\u00A0');
  
  // Return with regular spaces for the rest, non-breaking for last 2
  return before.length > 0 ? `${before.join(' ')} ${joinedLastWords}` : joinedLastWords;
}

/**
 * React component wrapper that applies text wrapping rules
 * Use this to wrap text elements that should prevent orphaned words
 * 
 * @param {React.ReactNode} children - The text content
 * @param {string} className - Additional CSS classes
 * @returns {JSX.Element}
 */
export function SmartTextWrap({ children, className = '' }) {
  if (typeof children === 'string') {
    const processedText = preventOrphanedWords(children);
    return <span className={className} dangerouslySetInnerHTML={{ __html: processedText }} />;
  }
  
  // If children is not a string, render as-is
  return <span className={className}>{children}</span>;
}

