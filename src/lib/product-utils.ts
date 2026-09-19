export function normalizeProductTitle(title: string): string {
  if (!title) return "Unknown Product";
  
  const lowerTitle = title.toLowerCase();
  
  // 1. Dictionary-based matching for known core products
  // This ensures variations like "Rust Orange Remi Cotton Shirt" map exactly to "Remi Cotton Shirt"
  if (lowerTitle.includes("remi cotton")) return "Remi Cotton Shirt";
  if (lowerTitle.includes("bootcut jeans")) return "Bootcut Jeans";
  if (lowerTitle.includes("track trouser") || lowerTitle.includes("track trousers")) return "Track Trousers";
  if (lowerTitle.includes("trousers") || lowerTitle.includes("trouser")) return "Trousers";
  if (lowerTitle.includes("knit tee") || lowerTitle.includes("t-shirt") || lowerTitle.includes("tshirt")) return "T-Shirt";
  if (lowerTitle.includes("polo")) return "Polo Shirt";

  // 2. Regex-based color stripping as a fallback for unknown products
  const colorsToRemove = [
    "rust", "orange", "sky", "blue", "black", "white", "beige", "pink", "striped", 
    "olive", "green", "red", "yellow", "purple", "grey", "gray", "navy", "maroon", 
    "burgundy", "brown", "premium", "dark", "light"
  ];
  
  let normalizedTitle = title;
  
  // Remove color words (case insensitive, whole words)
  colorsToRemove.forEach(color => {
    const regex = new RegExp(`\\b${color}\\b`, 'gi');
    normalizedTitle = normalizedTitle.replace(regex, '');
  });
  
  // Clean up punctuation and extra spaces left behind
  normalizedTitle = normalizedTitle
    .replace(/[—\-_|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  return normalizedTitle || title;
}
