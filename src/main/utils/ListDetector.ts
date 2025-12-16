/**
 * ListDetector - Detects list patterns in element selectors
 * Uses semantic analysis to identify when an action targets a list item
 */
export interface ListDetectionResult {
  isList: boolean;
  containerSelector?: string;
}

export class ListDetector {
  // Common list patterns
  private listPatterns = [
    // CSS class patterns
    /\.(item|list-item|listitem|entry|row|entry-item|product-item|card-item)/i,
    // Data attribute patterns
    /\[data-(index|item|id|key|position)\]/i,
    // Semantic HTML patterns
    /(ul|ol|li|dl|dt|dd)/i,
    // Role-based patterns
    /\[role=["'](listitem|option|menuitem|tab)["']\]/i,
    // Index-based selectors
    /:nth-child\(/i,
    /:nth-of-type\(/i,
    // Common list container patterns
    /\.(list|items|container|grid|collection|group)/i,
  ];

  // List container patterns
  private containerPatterns = [
    /(ul|ol|dl)/i,
    /\[role=["']list["']\]/i,
    /\.(list|items|container|grid|collection|group)/i,
  ];

  /**
   * Detect if an element selector represents a list item
   */
  detectList(selector: string): ListDetectionResult {
    if (!selector || typeof selector !== "string") {
      return { isList: false };
    }

    // Check if selector matches list patterns
    for (const pattern of this.listPatterns) {
      if (pattern.test(selector)) {
        // Try to extract container selector
        const containerSelector = this.extractContainerSelector(selector);
        return {
          isList: true,
          containerSelector,
        };
      }
    }

    // Check for parent-child relationships that suggest lists
    if (this.hasListStructure(selector)) {
      const containerSelector = this.extractContainerSelector(selector);
      return {
        isList: true,
        containerSelector,
      };
    }

    return { isList: false };
  }

  /**
   * Extract container selector from element selector
   */
  private extractContainerSelector(selector: string): string | undefined {
    // Try to find parent container
    // For selectors like "ul > li:nth-child(2)", return "ul"
    const parentMatch = selector.match(/^([^>]+)\s*>/);
    if (parentMatch) {
      const parent = parentMatch[1].trim();
      // Check if parent looks like a container
      for (const pattern of this.containerPatterns) {
        if (pattern.test(parent)) {
          return parent;
        }
      }
      return parent;
    }

    // For class-based selectors, try to find container class
    const classMatch = selector.match(/\.([^.\s:]+)/);
    if (classMatch) {
      const className = classMatch[1];
      // Common container patterns
      if (className.includes("item") || className.includes("entry")) {
        // Try to find parent container
        const containerName = className.replace(/(item|entry)$/i, "");
        if (containerName) {
          return `.${containerName}`;
        }
      }
    }

    // Default: try to find closest list-like parent
    return this.findListContainer(selector);
  }

  /**
   * Find list container from selector
   */
  private findListContainer(selector: string): string | undefined {
    // Common patterns:
    // - ".product-list .product-item" -> ".product-list"
    // - "#items li" -> "#items"
    // - "[data-list] [data-item]" -> "[data-list]"

    const parts = selector.split(/\s+/);
    if (parts.length > 1) {
      // Return the parent part
      return parts[0];
    }

    return undefined;
  }

  /**
   * Check if selector has list structure (parent-child relationship)
   */
  private hasListStructure(selector: string): boolean {
    // Check for parent > child patterns
    if (selector.includes(">")) {
      const parts = selector.split(">").map((p) => p.trim());
      // Check if parent is a list container
      for (const pattern of this.containerPatterns) {
        if (pattern.test(parts[0])) {
          return true;
        }
      }
    }

    // Check for space-separated selectors (descendant)
    if (selector.includes(" ")) {
      const parts = selector.split(/\s+/);
      // Check if any part looks like a list container
      for (const part of parts) {
        for (const pattern of this.containerPatterns) {
          if (pattern.test(part)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

























