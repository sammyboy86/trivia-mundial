import React from "react";

/**
 * Parses text containing **bold** or *bold* markdown and returns an array of React nodes.
 */
export function renderWithBold(text: string | undefined): React.ReactNode {
  if (!text) return null;
  
  // Split by **...** or *...*
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        } else if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
          return <strong key={index}>{part.slice(1, -1)}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}
