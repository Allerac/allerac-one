# SEO Schema Markup

JSON-LD blocks to paste into the `<head>` of **allerac.ai**. Each block is independent — add all of them for maximum coverage.

---

## 1. Organization

Tells Google and AI crawlers who Allerac is.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Allerac",
  "legalName": "Allerac",
  "url": "https://allerac.ai",
  "logo": "https://allerac.ai/logo.png",
  "description": "Private AI infrastructure for individuals and businesses. Self-hosted AI agents that run on your own hardware — your data never leaves your control.",
  "foundingDate": "2025",
  "sameAs": [
    "https://github.com/allerac",
    "https://www.linkedin.com/company/allerac",
    "https://discord.gg/allerac"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "hello@allerac.ai",
    "availableLanguage": ["English", "Portuguese", "Spanish"]
  }
}
</script>
```

---

## 2. SoftwareApplication — Allerac One (open source)

Tells Google this is an AI software product, not a medicine.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Allerac One",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Artificial Intelligence",
  "operatingSystem": "Linux, macOS",
  "url": "https://allerac.ai",
  "downloadUrl": "https://get.allerac.ai",
  "installUrl": "https://get.allerac.ai",
  "softwareVersion": "1.0",
  "releaseNotes": "https://github.com/allerac/allerac-one/releases",
  "softwareRequirements": "Docker, 16GB RAM, 40GB disk",
  "description": "Self-hosted AI assistant with conversation memory, RAG document search, web search, and local LLM inference via Ollama. Runs entirely on your own hardware. No subscriptions, no telemetry, no vendor lock-in.",
  "featureList": [
    "Local LLM inference via Ollama",
    "Retrieval-Augmented Generation (RAG)",
    "Conversation memory across sessions",
    "Web search via Tavily",
    "Telegram bot integration",
    "Health dashboard with Garmin connect",
    "Scheduled jobs",
    "Multi-model support (Qwen, DeepSeek, Llama, GPT-4o, Gemini)",
    "GDPR and LGPD compliant by design"
  ],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR"
  },
  "author": {
    "@type": "Organization",
    "name": "Allerac",
    "url": "https://allerac.ai"
  },
  "screenshot": "https://allerac.ai/screenshot.png",
  "keywords": "private AI, local LLM, self-hosted AI, RAG, Ollama, ChatGPT alternative, LGPD AI, GDPR AI, local ChatGPT"
}
</script>
```

---

## 3. Product — Allerac Lite (hardware)

Tells Google this is a physical product for sale.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Allerac Lite",
  "description": "Pre-configured mini PC with private AI assistant. Intel N100, 16GB RAM, Allerac One pre-installed. Plug in and start chatting — no setup required.",
  "brand": {
    "@type": "Brand",
    "name": "Allerac"
  },
  "category": "Computers > Mini PCs",
  "url": "https://allerac.ai/hardware/lite",
  "image": "https://allerac.ai/hardware/lite.jpg",
  "sku": "ALLERAC-LITE-001",
  "offers": {
    "@type": "Offer",
    "price": "149",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "Allerac"
    }
  },
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "CPU", "value": "Intel N100" },
    { "@type": "PropertyValue", "name": "RAM", "value": "16GB DDR4" },
    { "@type": "PropertyValue", "name": "Storage", "value": "256GB NVMe" },
    { "@type": "PropertyValue", "name": "Power consumption", "value": "~15W" },
    { "@type": "PropertyValue", "name": "Pre-installed model", "value": "Qwen 2.5 3B" },
    { "@type": "PropertyValue", "name": "Inference speed", "value": "~8 tokens/second" }
  ]
}
</script>
```

---

## 4. Product — Allerac Home

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Allerac Home",
  "description": "Pre-configured desktop AI assistant. Intel i5 / Ryzen 5, 32GB RAM, Allerac One pre-installed. Runs larger models, supports multiple users.",
  "brand": {
    "@type": "Brand",
    "name": "Allerac"
  },
  "category": "Computers > Mini PCs",
  "url": "https://allerac.ai/hardware/home",
  "image": "https://allerac.ai/hardware/home.jpg",
  "sku": "ALLERAC-HOME-001",
  "offers": {
    "@type": "Offer",
    "price": "349",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "Allerac"
    }
  }
}
</script>
```

---

## 5. FAQPage

FAQ blocks rank in Google as rich results and are consumed by AI crawlers as authoritative Q&A.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Allerac?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Allerac is a private AI assistant platform. It runs entirely on your own hardware — a mini PC, home server, or any Linux/macOS machine. Your conversations, documents, and data never leave your machine. No subscriptions, no telemetry, no vendor lock-in."
      }
    },
    {
      "@type": "Question",
      "name": "Is Allerac free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Allerac One is free and open source (MIT license). You only pay for your own hardware (a mini PC from ~€150) and electricity (~€3/month). There are no monthly fees. A cloud-hosted version is available from €9/month for users who prefer managed infrastructure."
      }
    },
    {
      "@type": "Question",
      "name": "Does Allerac work offline?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Allerac One runs local AI models via Ollama and works fully offline. No internet connection is required for AI inference. Optional features like web search require internet access."
      }
    },
    {
      "@type": "Question",
      "name": "Is Allerac GDPR and LGPD compliant?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Allerac One is compliant by design — all data (conversations, documents, memories) stays in your local PostgreSQL database. Nothing is sent to external servers. There is no telemetry, no crash reporting, and no data processing agreements required."
      }
    },
    {
      "@type": "Question",
      "name": "What AI models does Allerac support?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Allerac supports any model available in Ollama for local inference, including Qwen 2.5, DeepSeek, Llama 3, and Mistral. It also supports cloud models via API key: GPT-4o (GitHub Models), Gemini 2.0 Flash and 2.5 Pro (Google AI Studio), and others."
      }
    },
    {
      "@type": "Question",
      "name": "How do I install Allerac?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run one command: curl -sSL https://get.allerac.ai | bash — The installer detects your OS, installs Docker if needed, asks your hardware tier, downloads the right AI model, and starts everything. Your assistant is ready at http://localhost:8080."
      }
    },
    {
      "@type": "Question",
      "name": "What hardware do I need to run Allerac?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Minimum: any Linux or macOS machine with 16GB RAM and 40GB free disk. Recommended entry-level: Intel N100 mini PC with 16GB RAM (~€150), which runs Qwen 2.5 3B at ~8 tokens/second. For better performance: Intel i5/i7 with 32-64GB RAM supports larger models (7B-14B)."
      }
    }
  ]
}
</script>
```

---

## How to add to your site

If the site is a simple HTML page, paste all blocks inside `<head>`:

```html
<head>
  <title>Allerac — Private AI Infrastructure</title>
  <meta name="description" content="Self-hosted AI assistant. Runs on your hardware. Your data never leaves. Free and open source.">

  <!-- Schema markup -->
  <!-- paste Organization block here -->
  <!-- paste SoftwareApplication block here -->
  <!-- paste FAQPage block here -->
  <!-- paste Product blocks for hardware pages only -->
</head>
```

If the site is Next.js (like allerac-one), use the `metadata` API or add via `<Script>` in `layout.tsx`:

```tsx
// app/layout.tsx
const schemaOrg = { /* paste JSON object here */ };

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## Meta tags (non-schema, also important)

Add these to every page of allerac.ai:

```html
<!-- Primary -->
<meta name="description" content="Private AI assistant that runs on your own hardware. No subscriptions, no telemetry, no vendor lock-in. Free and open source.">
<meta name="keywords" content="private AI, local LLM, self-hosted AI, ChatGPT alternative, local ChatGPT, RAG, Ollama, LGPD AI, GDPR AI, AI privada, IA local">
<meta name="author" content="Allerac">

<!-- Open Graph (LinkedIn, WhatsApp, Slack previews) -->
<meta property="og:type" content="website">
<meta property="og:title" content="Allerac — Your private AI. Runs on your hardware.">
<meta property="og:description" content="Self-hosted AI assistant with memory, RAG, and web search. Your data never leaves your machine. Free and open source.">
<meta property="og:image" content="https://allerac.ai/og-image.png">
<meta property="og:url" content="https://allerac.ai">

<!-- Twitter/X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Allerac — Your private AI. Runs on your hardware.">
<meta name="twitter:description" content="Self-hosted AI assistant. No subscriptions, no telemetry. Free and open source.">
<meta name="twitter:image" content="https://allerac.ai/og-image.png">
```

---

## Validate

After adding to your site, validate at:
- **Google:** https://search.google.com/test/rich-results
- **Schema.org:** https://validator.schema.org
