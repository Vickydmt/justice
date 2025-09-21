#!/usr/bin/env node

// Quick test for specific patterns
const testCases = [
  {
    name: "SSN",
    text: "123-45-6789",
    pattern: /\b(?:\d{3}[-.\s]?\d{2}[-.\s]?\d{4})\b/g,
    expected: "███████████"
  },
  {
    name: "Credit Card",
    text: "4532-1234-5678-9012",
    pattern: /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g,
    expected: "███████████████████"
  },
  {
    name: "Email",
    text: "john.smith@example.com",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    expected: "[REDACTED-22]"
  },
  {
    name: "Phone",
    text: "(555) 123-4567",
    pattern: /\([0-9]{3}\)\s?[0-9]{3}[-.\s]?[0-9]{4}/g,
    expected: "**************"
  },
  {
    name: "Invoice Number",
    text: "Invoice #: US-001",
    pattern: /\b(?:Invoice|INV|Invoice\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    expected: "Invoice #: U███1"
  }
];

function testPattern(name, text, pattern, expected) {
  const matches = text.match(pattern);
  if (matches) {
    const match = matches[0];
    let redacted;
    
    if (name === "Email") {
      redacted = `[REDACTED-${match.length}]`;
    } else if (name === "Phone") {
      redacted = "*".repeat(match.length);
    } else if (name === "Invoice Number") {
      const invoiceMatch = match.match(/([A-Z0-9-]{6,20})/);
      if (invoiceMatch) {
        const invoiceNum = invoiceMatch[1];
        redacted = match.replace(invoiceNum, invoiceNum.charAt(0) + "█".repeat(invoiceNum.length - 2) + invoiceNum.charAt(invoiceNum.length - 1));
      }
    } else {
      redacted = "█".repeat(match.length);
    }
    
    const passed = redacted === expected;
    console.log(`${passed ? "✅" : "❌"} ${name}: "${text}" → "${redacted}" ${passed ? "" : `(expected: "${expected}")`}`);
    return passed;
  } else {
    console.log(`❌ ${name}: No detection for "${text}"`);
    return false;
  }
}

console.log("🧪 Quick Pattern Test...\n");

let passed = 0;
testCases.forEach(test => {
  if (testPattern(test.name, test.text, test.pattern, test.expected)) {
    passed++;
  }
});

console.log(`\n📊 Results: ${passed}/${testCases.length} tests passed`);

if (passed === testCases.length) {
  console.log("🎉 All tests passed!");
} else {
  console.log("⚠️ Some tests failed. Check the patterns.");
}
