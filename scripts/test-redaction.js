#!/usr/bin/env node

/**
 * Test script for FinSecure-Redact functionality
 * This script tests the redaction patterns and NER models
 */

// Test financial document text with various PII entities
const testDocument = `
INVOICE
East Repair Inc.
1912 Harvest Lane, New York, NY 12210

Bill To: John Smith
2 Court Square, New York, NY 12210

Ship To: John Smith  
3787 Pineview Drive, Cambridge, MA 12210

Invoice #: US-001
Invoice Date: 11/02/2019
P.O.#: 2312/2019
Due Date: 26/02/2019

Description: Front and rear brake cables
QTY: 1, UNIT PRICE: 100.00, AMOUNT: 100.00

Description: New set of pedal arms
QTY: 2, UNIT PRICE: 15.00, AMOUNT: 30.00

Description: Labor 3hrs
QTY: 3, UNIT PRICE: 5.00, AMOUNT: 15.00

Subtotal: 145.00
Sales Tax 6.25%: 9.06
TOTAL: $154.06

Payment is due within 15 days.
Customer ID: CUST-12345
Account Number: 1234567890
Routing Number: 987654321
Credit Card: 4532-1234-5678-9012
SSN: 123-45-6789
Phone: (555) 123-4567
Email: john.smith@example.com

Signature: John Smith
`;

// Enhanced financial patterns for testing
const ENHANCED_FINANCIAL_PATTERNS = {
  SSN: {
    pattern: /\b(?:\d{3}[-.\s]?\d{2}[-.\s]?\d{4}|\d{9})\b/g,
    riskLevel: "CRITICAL",
    redactionPolicy: "FULL",
  },
  CREDIT_CARD: {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    riskLevel: "CRITICAL",
    redactionPolicy: "FULL",
  },
  ACCOUNT_NUMBER: {
    pattern: /\b(?:Account|Acct)[\s#:]*(\d{8,17})\b/gi,
    riskLevel: "CRITICAL",
    redactionPolicy: "FULL",
  },
  ROUTING_NUMBER: {
    pattern: /\b(?:Routing|ABA|RTN)[\s#:]*(\d{9})\b/gi,
    riskLevel: "CRITICAL",
    redactionPolicy: "FULL",
  },
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    riskLevel: "HIGH",
    redactionPolicy: "HASH",
  },
  PHONE: {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    riskLevel: "HIGH",
    redactionPolicy: "MASK",
  },
  INVOICE_NUMBER: {
    pattern: /\b(?:Invoice|INV|Invoice\s*#)[\s#:]*([A-Z0-9-]{6,20})\b/gi,
    riskLevel: "MEDIUM",
    redactionPolicy: "PARTIAL",
  },
  CUSTOMER_ID: {
    pattern: /\b(?:Customer|Cust|ID)[\s#:]*([A-Z0-9-]{6,15})\b/gi,
    riskLevel: "HIGH",
    redactionPolicy: "FULL",
  },
  AMOUNT: {
    pattern: /\b(?:\$|USD|INR|EUR|GBP)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/g,
    riskLevel: "MEDIUM",
    redactionPolicy: "PARTIAL",
  },
  DATE: {
    pattern: /\b(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\b/g,
    riskLevel: "LOW",
    redactionPolicy: "PARTIAL",
  },
  SIGNATURE: {
    pattern: /\b(?:Signature|Sign)[\s:]*([A-Za-z\s]{3,30})\b/gi,
    riskLevel: "HIGH",
    redactionPolicy: "FULL",
  },
  ADDRESS: {
    pattern: /\b(?:\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct|Place|Pl|Square|Sq|Way|Trail|Trl|Terrace|Ter|Parkway|Pkwy))\b/gi,
    riskLevel: "HIGH",
    redactionPolicy: "PARTIAL",
  },
};

// Function to apply redaction based on policy
function applyRedaction(text, policy) {
  switch (policy) {
    case "FULL":
      return "█".repeat(Math.max(text.length, 3));
    case "PARTIAL":
      if (text.length <= 3) return "█".repeat(text.length);
      return text.charAt(0) + "█".repeat(text.length - 2) + text.charAt(text.length - 1);
    case "HASH":
      return `[REDACTED-${text.length}]`;
    case "MASK":
      return "*".repeat(text.length);
    default:
      return "█".repeat(text.length);
  }
}

// Function to detect entities using patterns
function detectEntities(text) {
  const entities = [];
  
  Object.entries(ENHANCED_FINANCIAL_PATTERNS).forEach(([labelKey, config]) => {
    const matches = Array.from(text.matchAll(config.pattern));
    matches.forEach((match) => {
      if (match.index !== undefined) {
        const entityText = match[1] || match[0]; // Use capture group if available
        
        entities.push({
          text: entityText,
          label: labelKey,
          confidence: 0.95, // High confidence for pattern matches
          start: match.index + match[0].indexOf(entityText),
          end: match.index + match[0].indexOf(entityText) + entityText.length,
          redactionPolicy: config.redactionPolicy,
          riskLevel: config.riskLevel,
        });
      }
    });
  });
  
  return entities;
}

// Function to generate redacted text
function generateRedactedText(originalText, entities) {
  let redactedText = originalText;
  let offset = 0;
  
  const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
  
  for (const entity of sortedEntities) {
    const redactedValue = applyRedaction(entity.text, entity.redactionPolicy);
    const adjustedStart = entity.start + offset;
    const adjustedEnd = entity.end + offset;
    
    redactedText = redactedText.slice(0, adjustedStart) + redactedValue + redactedText.slice(adjustedEnd);
    offset += redactedValue.length - entity.text.length;
  }
  
  return redactedText;
}

// Main test function
function testRedaction() {
  console.log("🧪 Testing FinSecure-Redact Patterns...\n");
  
  // Detect entities
  const entities = detectEntities(testDocument);
  
  console.log(`📊 Detected ${entities.length} entities:`);
  entities.forEach((entity, index) => {
    console.log(`${index + 1}. ${entity.label}: "${entity.text}" (${entity.riskLevel} risk, ${entity.redactionPolicy} policy)`);
  });
  
  console.log("\n🔍 Original Document:");
  console.log("=" * 50);
  console.log(testDocument);
  
  // Generate redacted text
  const redactedText = generateRedactedText(testDocument, entities);
  
  console.log("\n🛡️ Redacted Document:");
  console.log("=" * 50);
  console.log(redactedText);
  
  // Statistics
  const criticalEntities = entities.filter(e => e.riskLevel === "CRITICAL").length;
  const highRiskEntities = entities.filter(e => e.riskLevel === "HIGH").length;
  const mediumRiskEntities = entities.filter(e => e.riskLevel === "MEDIUM").length;
  const lowRiskEntities = entities.filter(e => e.riskLevel === "LOW").length;
  
  console.log("\n📈 Redaction Statistics:");
  console.log(`Total Entities: ${entities.length}`);
  console.log(`Critical Risk: ${criticalEntities}`);
  console.log(`High Risk: ${highRiskEntities}`);
  console.log(`Medium Risk: ${mediumRiskEntities}`);
  console.log(`Low Risk: ${lowRiskEntities}`);
  
  // Test specific patterns
  console.log("\n🎯 Pattern Test Results:");
  const testCases = [
    { pattern: "SSN", text: "123-45-6789", expected: "█████████" },
    { pattern: "Credit Card", text: "4532-1234-5678-9012", expected: "████████████████" },
    { pattern: "Email", text: "john.smith@example.com", expected: "[REDACTED-21]" },
    { pattern: "Phone", text: "(555) 123-4567", expected: "************" },
    { pattern: "Invoice Number", text: "US-001", expected: "U███1" },
  ];
  
  testCases.forEach(test => {
    const testEntities = detectEntities(test.text);
    if (testEntities.length > 0) {
      const redacted = applyRedaction(testEntities[0].text, testEntities[0].redactionPolicy);
      const passed = redacted === test.expected;
      console.log(`${passed ? "✅" : "❌"} ${test.pattern}: "${test.text}" → "${redacted}" ${passed ? "" : `(expected: "${test.expected}")`}`);
    } else {
      console.log(`❌ ${test.pattern}: No detection for "${test.text}"`);
    }
  });
  
  console.log("\n✨ Test completed!");
}

// Run the test
if (require.main === module) {
  testRedaction();
}

module.exports = {
  testRedaction,
  detectEntities,
  generateRedactedText,
  applyRedaction,
  ENHANCED_FINANCIAL_PATTERNS,
};
