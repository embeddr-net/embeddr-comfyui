// Emulate a React hook-like behavior but designed for LiteGraph nodes class/prototype usage
// Since LiteGraph nodes are not React components, this is more of a mixin/utility function

export interface DragAndDropOptions {
  // Return true if handled
  onDragOver?: (e: DragEvent, node: any) => boolean;
  onDrop?: (e: DragEvent, node: any) => boolean;
  // If specific data types are required
  acceptTypes?: string[];
}

/**
 * Adds drag and drop file/data handling to a node prototype
 */
export function registerNodeDragAndDrop(
  nodeType: any,
  options: DragAndDropOptions
) {
  const { onDragOver, onDrop, acceptTypes = [] } = options;

  const originalDragOver = nodeType.prototype.onDragOver;
  nodeType.prototype.onDragOver = function (e: DragEvent) {
    if (e.dataTransfer) {
      // Check if we have any of the accepted types
      const hasAcceptedType =
        acceptTypes.length === 0 ||
        acceptTypes.some(
          (type) => e.dataTransfer && e.dataTransfer.types.includes(type)
        );

      if (hasAcceptedType) {
        if (onDragOver) {
          // Allow custom handler to intervene
          const handled = onDragOver.call(this, e, this);
          if (handled) {
            e.preventDefault();
            return true;
          }
        }
        // Default behavior if type matches: allow drop
        e.preventDefault();
        return true;
      }
    }
    // Fallback to original
    return originalDragOver ? originalDragOver.apply(this, arguments) : false;
  };

  const originalDragDrop = nodeType.prototype.onDragDrop;
  nodeType.prototype.onDragDrop = function (e: DragEvent) {
    if (e.dataTransfer) {
      const hasAcceptedType =
        acceptTypes.length === 0 ||
        acceptTypes.some(
          (type) => e.dataTransfer && e.dataTransfer.types.includes(type)
        );

      if (hasAcceptedType && onDrop) {
        const handled = onDrop.call(this, e, this);
        if (handled) return true;
      }
    }
    return originalDragDrop ? originalDragDrop.apply(this, arguments) : false;
  };
}
