import { describe, it, expect } from 'vitest';
import { exportMarkdownToDocx } from './docxExporter';
import {
  exportMarkdownToPptx,
  parseMarkdownToSlides,
  isPresentationMarkdown,
  extractSlideDeck,
  splitPresentationContent,
  cleanSlideTitle,
  cleanFallbackTitle,
  getSlideCodeBadge,
  calculateAdaptiveCodeLayout,
  isLogoPlaceholderLine,
  extractLogoFromLine,
  getLogoPlaceholderDataUrl,
} from './pptxExporter';
import { exportMarkdownToPdf, transliterateUnicodeSymbols } from './pdfExporter';
import { resolveCodeBadge } from '../components/chat/CodeBlock';

describe('Document Exporters', () => {
  const sampleMarkdown = `
# Student Performance Report
This report outlines the academic standings and examination results.

## Executive Summary
- Total Students Assessed: 5
- Passing Students: 3 (60%)
- Failing Students: 2 (40%)
- Class Average Score: 66.4%

### Detailed Student Marks
| Student ID | Student Name | Subject | Marks Obtained | Total Marks | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| STU-101 | Alice Smith | Mathematics | 85 | 100 | PASS |
| STU-102 | Bob Jones | Mathematics | 42 | 100 | FAIL |
| STU-103 | Charlie Brown | Mathematics | 78 | 100 | PASS |

> Recommendation: Students who achieved a FAIL status must attend remedial support.

\`\`\`typescript
const passingThreshold = 50;
\`\`\`
  `;

  it('generates a valid Word (.docx) Blob from markdown', async () => {
    const blob = await exportMarkdownToDocx(sampleMarkdown, {
      title: 'Student Performance Report',
      author: 'Test Author',
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(500); // Realistic OOXML size
    expect(blob.type).toContain('wordprocessingml.document');
  });

  it('generates a valid PowerPoint (.pptx) Blob from markdown in widescreen without watermarks for paid users', async () => {
    const blob = await exportMarkdownToPptx(sampleMarkdown, {
      title: 'Student Performance Report',
      author: 'Test Presenter',
      showWatermark: false,
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(500); // Realistic PPTX zip size
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  });

  it('generates a valid PowerPoint (.pptx) Blob with Sree AI clickable watermark for free/anonymous users', async () => {
    const blobWithWatermark = await exportMarkdownToPptx(sampleMarkdown, {
      title: 'Student Performance Report',
      author: 'Free User',
      showWatermark: true,
    });

    expect(blobWithWatermark).toBeDefined();
    expect(blobWithWatermark.size).toBeGreaterThan(500);
  });

  it('generates a valid vector PDF (.pdf) Blob from markdown with multi-page code blocks', async () => {
    const longCodeMd = `
# System Architecture

## Full Implementation Script
\`\`\`python
${Array.from({ length: 80 }, (_, i) => `def process_step_${i}():\n    return ${i} * 42`).join('\n')}
\`\`\`
    `;

    const blob = await exportMarkdownToPdf(longCodeMd, {
      title: 'System Architecture',
      includeMetadata: false, // tests watermark-free mode
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1500); // multi-page vector PDF
    expect(blob.type).toContain('application/pdf');
  });

  it('handles empty or minimal markdown gracefully for docx, pptx, and pdf', async () => {
    const minimal = 'Just a simple single line of text';
    const docxBlob = await exportMarkdownToDocx(minimal);
    expect(docxBlob).toBeDefined();
    expect(docxBlob.size).toBeGreaterThan(0);

    const pptxBlob = await exportMarkdownToPptx(minimal);
    expect(pptxBlob).toBeDefined();
    expect(pptxBlob.size).toBeGreaterThan(0);

    const pdfBlob = await exportMarkdownToPdf(minimal);
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(0);
  });

  it('correctly handles emojis across title, headings, and bullet points in PDF export', async () => {
    const emojiMd = `
# Durga Puja: The Eternal Festival of Shakti 🔱

## The Iconography of Maa Durga 🦁
- The Dhak (🥁): The rhythmic heartbeat of the festival.
- Dhunuchi Naach (🪔): A mesmerizing devotional dance.
- Sindoor Khela (🌺): Celebrating female solidarity.
- The Conch (🐚): Sound that heralds divinity.

## Artistic Grandeur: The Pandal Culture 🎨
> Inspirational quote with flame 🔥 and spark ✨
    `;

    const blob = await exportMarkdownToPdf(emojiMd, {
      title: 'Durga Puja: The Eternal Festival of Shakti 🔱',
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/pdf');
  });

  it('correctly parses presentation slides and cleans LaTeX math expressions', () => {
    const realAiResponse = `
You are absolutely right, and I apologize for the oversight. I have the capability to structure this content so it can be exported directly as a professional PowerPoint presentation.

Below is the complete slide-by-slide content for your presentation on Global Warming. To generate your PPT, click the **Export (📥)** button in the action bar below this message and select **PowerPoint (.pptx)**:

---

### Slide 1: Title Slide
# Global Warming: Causes, Impacts & Solutions
## An In-Depth Scientific Analysis
Prepared by Sree AI

---

### Slide 2: Executive Summary
- Limiting warming to $1.5^\\circ\\text{C}$ requires global greenhouse gas emissions to peak before 2025
- Human activities are the dominant cause
- Immediate action is required to reach net-zero by 2050

---

### Slide 3: Major Greenhouse Gases
| Gas | Chemical Formula | Atmospheric Lifetime | Primary Source |
| :--- | :--- | :--- | :--- |
| Carbon Dioxide | CO2 | 100+ years | Fossil fuel combustion |
| Methane | CH4 | 12 years | Agriculture & Livestock |
| Nitrous Oxide | N2O | 114 years | Fertilizers |

---

### Slide 4: Conclusion & Path Forward
- Rapid decarbonization across energy and transport
- Reforestation and land conservation
- Global policy alignment via COP commitments
    `;

    const parsed = parseMarkdownToSlides(realAiResponse);

    // 1. Presentation title must be extracted cleanly from Slide 1 # header
    expect(parsed.title).toBe('Global Warming: Causes, Impacts & Solutions');
    expect(parsed.subtitle).toBe('An In-Depth Scientific Analysis');

    // 2. Chat preamble ("I apologize for the oversight...") must NOT become a slide!
    // 3. Exactly 3 content slides (Slide 2, Slide 3, Slide 4)
    expect(parsed.slides.length).toBe(3);

    // 4. Slide titles must be clean, devoid of 'Slide N:' prefixes
    expect(parsed.slides[0].title).toBe('Executive Summary');
    expect(parsed.slides[1].title).toBe('Major Greenhouse Gases');
    expect(parsed.slides[2].title).toBe('Conclusion & Path Forward');

    // 5. LaTeX expressions must be cleaned: $1.5^\circ\text{C}$ -> 1.5°C
    expect(parsed.slides[0].bullets[0]).toContain('1.5°C');
    expect(parsed.slides[0].bullets[0]).not.toContain('$');
    expect(parsed.slides[0].bullets[0]).not.toContain('\\circ');

    // 6. NO slide may contain '---' as title, paragraph, or bullet
    for (const slide of parsed.slides) {
      expect(slide.title).not.toContain('---');
      expect(slide.title).not.toMatch(/^Key Points \d+$/);
      for (const p of slide.paragraphs) {
        expect(p).not.toContain('---');
        expect(p).not.toMatch(/^#{1,4}\s+/);
      }
      for (const b of slide.bullets) {
        expect(b).not.toContain('---');
        expect(b).not.toMatch(/^#{1,4}\s+/);
      }
    }

    // 7. Slide 3 must contain the table
    expect(parsed.slides[1].tableLines.length).toBeGreaterThan(0);
  });

  it('correctly detects presentations and extracts SlideDeckData for interactive carousel', () => {
    const regularDocument = `
# Project Documentation
This is a standard markdown document that is not a presentation.
## Installation
Run npm install.
## Usage
Run npm start.
    `;
    expect(isPresentationMarkdown(regularDocument)).toBe(false);
    expect(extractSlideDeck(regularDocument)).toBeNull();

    const guideWithDividers = `
# How to Learn Python
To master Python, follow a structured phased roadmap.

---

## Phase 1: Core Fundamentals
- Variables, data types, and control flow
- Functions and modules

---

## Phase 2: Object-Oriented Programming
- Classes, inheritance, and polymorphism

---

### Tips for Success
1. Build real-world projects daily.
2. Read the official Python documentation.

You can download this guide as a clean, formatted document by clicking the Export button and selecting Word Document (.docx) or PDF Document (.pdf).
    `;
    expect(isPresentationMarkdown(guideWithDividers)).toBe(false);
    expect(extractSlideDeck(guideWithDividers)).toBeNull();

    const slidePresentation = `
# Artificial Intelligence in Medicine
## Clinical Breakthroughs and Ethical Frontiers

---
## Slide 2: Diagnostic Imaging
- Neural networks achieving 98% sensitivity on thoracic radiographs
- Cross-modality feature alignment reduces false positives
- Real-time heatmaps highlight critical lesion margins

---
## Slide 3: Robotic Surgery & Telepresence
- Sub-millimeter dexterity in minimally invasive procedures
- Haptic feedback integration for enhanced surgeon spatial awareness
- Latency reduced to under 15ms over 5G networks

---
## Slide 4: Path Forward & Regulation
- FDA software-as-a-medical-device (SaMD) clearances expanding
- Multimodal foundation models accelerating drug target discovery
    `;

    expect(isPresentationMarkdown(slidePresentation)).toBe(true);
    const deck = extractSlideDeck(slidePresentation);
    expect(deck).not.toBeNull();
    if (!deck) throw new Error('Expected deck to be defined');

    expect(deck.title).toBe('Artificial Intelligence in Medicine');
    expect(deck.subtitle).toBe('Clinical Breakthroughs and Ethical Frontiers');
    expect(deck.totalSlides).toBe(4); // 1 Title Slide + 3 Content Slides
    expect(deck.slides[0]?.isTitleSlide).toBe(true);
    expect(deck.slides[0]?.slideNumber).toBe(1);
    expect(deck.slides[1]?.title).toBe('Diagnostic Imaging');
    expect(deck.slides[1]?.slideNumber).toBe(2);
    expect(deck.slides[1]?.bullets.length).toBe(3);
    expect(deck.slides[2]?.title).toBe('Robotic Surgery & Telepresence');
    expect(deck.slides[3]?.title).toBe('Path Forward & Regulation');
  });

  it('detects themes from markdown and exports presentations with custom themes', async () => {
    const { detectThemeFromMarkdown, PRESENTATION_THEMES } = await import('./presentationThemes');

    const navyPrompt = 'Create a 5-slide presentation on Quantum Computing with navy and gold theme';
    const detectedNavy = detectThemeFromMarkdown(navyPrompt);
    expect(detectedNavy.id).toBe('navyGold');

    const lightPrompt = 'Please make this presentation with a clean white background minimalist light theme';
    const detectedLight = detectThemeFromMarkdown(lightPrompt);
    expect(detectedLight.id).toBe('modernLight');

    const emeraldPrompt = 'Here is a presentation on Sustainable Agriculture in emerald green';
    const detectedEmerald = detectThemeFromMarkdown(emeraldPrompt);
    expect(detectedEmerald.id).toBe('emeraldTech');

    // Test exporting PPTX with custom theme
    const blobNavy = await exportMarkdownToPptx(
      `# Quantum Supremacy\n## New Computing Paradigms\n---\n## Slide 2: Qubit Coherence\n- Superconducting circuits`,
      { theme: PRESENTATION_THEMES.navyGold }
    );
    expect(blobNavy).toBeDefined();
    expect(blobNavy.size).toBeGreaterThan(500);
  });

  it('splits presentation content into top guidance, slide deck, outline, and bottom guidance', () => {
    const rawAiResponse = `Here is a comprehensive, presentation-ready slide deck outlining the cultural significance of Durga Puja.

You can instantly download this as a formatted 16:9 presentation file by clicking the Export button below.

# Durga Puja: The Soul of Cultural Heritage
## Identity, Community, Art, and Universal Celebration

---

## Introduction: More Than Just a Festival
- The Homecoming of the Daughter: Goddess Durga returning to her maternal home
- Triumph of Light over Darkness: Commemorates defeat of Mahishasura
- Cultural Epicenter: Secular public celebration of life and art

---

## Conclusion: The Everlasting Spirit
- A Festival of Renewal: Rejuvenates collective community bonds
- Timeless Farewell: Bolo Durga Mai Ki Jai

---

Let me know if you would like me to adjust any slide content, expand on the rituals, or change the theme styling!`;

    const split = splitPresentationContent(rawAiResponse);
    expect(split.hasPresentation).toBe(true);
    expect(split.topText).toContain('Here is a comprehensive, presentation-ready slide deck');
    expect(split.topText).toContain('download this as a formatted 16:9 presentation');
    expect(split.topText).not.toContain('# Durga Puja');

    expect(split.slideDeck).not.toBeNull();
    if (!split.slideDeck) throw new Error('Expected slideDeck to be defined');
    expect(split.slideDeck.title).toBe('Durga Puja: The Soul of Cultural Heritage');
    expect(split.slideDeck.slides.length).toBe(3); // 1 title + 2 content slides

    expect(split.slideOutline).toContain('# Durga Puja: The Soul of Cultural Heritage');
    expect(split.slideOutline).toContain('Conclusion: The Everlasting Spirit');
    expect(split.slideOutline).not.toContain('Here is a comprehensive');
    expect(split.slideOutline).not.toContain('Let me know if you would like me to adjust');

    expect(split.bottomText).toBe('Let me know if you would like me to adjust any slide content, expand on the rituals, or change the theme styling!');
  });

  it('preserves all prior chat turns in topText and subsequent AI responses in bottomText across multi-turn conversation', () => {
    const multiTurnVoiceResponse = `what dangers you are referring to?
I am here to assist you professionally. Please let me know what topic or task you would like to work on next.
Please let me know what you would like to discuss or explore next regarding Elon Musk.
I'm sorry, I didn't quite catch that. Could you please repeat what you said?
না, এলন মাস্ক বেঁচে আছেন। তিনি বর্তমানে বিভিন্ন কোম্পানিতে কাজ করছেন এবং নতুন প্রজেক্ট নিয়ে ব্যস্ত আছেন।
আপনার কথা স্পষ্ট শোনা যাচ্ছে না, অনেক নয়েজ আসছে। আপনি কি দয়া করে আবার বলবেন?
আমি দুঃখিত, আপনার কথা স্পষ্ট বুঝতে পারছি না। দয়া করে আরেকবার বলবেন?

<!-- theme: navyGold -->

# Elon Musk
## Visionary Entrepreneur

---

## Early Life and Education
- Born in Pretoria, South Africa, in 1971.
- Taught himself computer programming at age 12.
- Moved to North America for university, attending Queen's University and transferring to the University of Pennsylvania.
- Earned degrees in Physics and Economics.
- Briefly attended Stanford University before dropping out to pursue the dot-com boom.

I've placed your presentation on screen! You can browse through the slides or download the .pptx file.

Elon Musk's net worth is estimated to be over $200 billion. He is the founder of SpaceX and CEO of Tesla.`;

    const split = splitPresentationContent(multiTurnVoiceResponse);
    expect(split.hasPresentation).toBe(true);
    expect(split.slideDeck).not.toBeNull();
    expect(split.slideDeck?.title).toBe('Elon Musk');
    expect(split.slideDeck?.slides.length).toBe(2);

    // CRITICAL: topText must preserve all prior conversation turns preceding the presentation
    expect(split.topText).toContain("what dangers you are referring to?");
    expect(split.topText).toContain("regarding Elon Musk");
    expect(split.topText).toContain("না, এলন মাস্ক বেঁচে আছেন");
    expect(split.topText).toContain("আপনার কথা স্পষ্ট শোনা যাচ্ছে না");
    expect(split.topText).not.toContain("# Elon Musk");
    expect(split.topText).not.toContain("Early Life and Education");

    // Verify slideOutline only contains the presentation
    expect(split.slideOutline).toContain('# Elon Musk');
    expect(split.slideOutline).toContain('Early Life and Education');
    expect(split.slideOutline).not.toContain("what dangers you are referring to");
    expect(split.slideOutline).not.toContain("না, এলন মাস্ক বেঁচে আছেন");
    expect(split.slideOutline).not.toContain("Elon Musk's net worth is estimated");

    // CRITICAL: bottomText must contain all subsequent conversational responses!
    expect(split.bottomText).toContain("I've placed your presentation on screen!");
    expect(split.bottomText).toContain("Elon Musk's net worth is estimated to be over $200 billion");
    expect(split.bottomText).toContain("He is the founder of SpaceX and CEO of Tesla");
  });

  it('preserves multi-lingual and Bengali prior chat, slides, and bottom outro text', () => {
    const bengaliVoiceResponse = `আপনার সাথে কথা বলে ভালো লাগল।
আপনি কি অন্য কোনো বিষয়ে জানতে চান?
আমি আপনাকে কীভাবে সাহায্য করতে পারি?

<!-- theme: midnightPurple -->

# এলন মাস্ক এবং মহাকাশ বিজ্ঞান
## একটি বিস্তারিত প্রেজেন্টেশন

---

## স্পেসএক্স এর ইতিহাস
- ২০০২ সালে প্রতিষ্ঠিত।
- পুনর্ব্যবহারযোগ্য রকেট প্রযুক্তির উদ্ভাবক।
- ফ্যালকন ৯ এবং স্টারশিপ এর নির্মাতা।

---

## ভবিষ্যতের লক্ষ্য
- মঙ্গলে মানব বসতি স্থাপন।
- বৈশ্বিক স্যাটেলাইট ইন্টারনেট স্টারলিংক।

আমি আপনার জন্য এলন মাস্কের প্রেজেন্টেশনটি তৈরি করে দিয়েছি। আপনি এটি ডাউনলোড করতে পারেন।
পরবর্তী পদক্ষেপে আপনি কী জানতে চান?`;

    const split = splitPresentationContent(bengaliVoiceResponse);
    expect(split.hasPresentation).toBe(true);
    expect(split.slideDeck).not.toBeNull();
    expect(split.slideDeck?.title).toContain('এলন মাস্ক');
    expect(split.slideDeck?.slides.length).toBe(3);

    // Prior chat preserved in topText
    expect(split.topText).toContain('আপনার সাথে কথা বলে ভালো লাগল');
    expect(split.topText).toContain('আমি আপনাকে কীভাবে সাহায্য করতে পারি?');
    expect(split.topText).not.toContain('স্পেসএক্স এর ইতিহাস');

    // Slide outline contains only slides
    expect(split.slideOutline).toContain('এলন মাস্ক এবং মহাকাশ বিজ্ঞান');
    expect(split.slideOutline).toContain('ভবিষ্যতের লক্ষ্য');
    expect(split.slideOutline).not.toContain('আপনার সাথে কথা বলে ভালো লাগল');
    expect(split.slideOutline).not.toContain('পরবর্তী পদক্ষেপে আপনি কী জানতে চান?');

    // Bottom text contains outro conversation
    expect(split.bottomText).toContain('আমি আপনার জন্য এলন মাস্কের প্রেজেন্টেশনটি তৈরি করে দিয়েছি');
    expect(split.bottomText).toContain('পরবর্তী পদক্ষেপে আপনি কী জানতে চান?');
    expect(split.bottomText).not.toContain('ভবিষ্যতের লক্ষ্য');
  });

  it('correctly splits MULTIPLE presentations into separate interactive slide deck segments without merging slide counts or dumping previous PPTs as text', () => {
    const multiPptSessionResponse = `হ্যাঁ, আমি ভালো আছি। আপনি কেমন আছেন? আমি আপনাকে কীভাবে সাহায্য করতে পারি?

<!-- theme: navyGold -->
# Elon Musk
## Visionary Entrepreneur

---

## Early Life and Education
- Born in Pretoria, South Africa, in 1971.
- Taught himself computer programming at age 12.

---

## Founding SpaceX
- Founded in 2002 to reduce space transportation costs.
- Developed Falcon 9 reusable rockets.

আমি আপনার জন্য এলন মাস্কের প্রথম প্রেজেন্টেশনটি তৈরি করে স্ক্রিনে দিয়েছি। আপনি এটি ডাউনলোড করতে পারেন।
বলুন, আপনার জন্য আর কী করতে পারি?

<!-- theme: midnightPurple -->
# Tesla: Accelerating Clean Energy
## The Electric Vehicle Revolution

---

## Tesla Roadster and Model S
- Proven that electric cars can be compelling and high-performance.
- Global mass market revolution with Model 3 and Model Y.

---

## Energy and Storage
- Powerwall, Megapack, and solar roof systems.
- Accelerating the transition to sustainable energy.

আমি আপনার জন্য টেসলার দ্বিতীয় প্রেজেন্টেশনটিও তৈরি করে স্ক্রিনে দিয়েছি! আপনি চাইলে এটিও ডাউনলোড করতে পারেন।`;

    const split = splitPresentationContent(multiPptSessionResponse);
    expect(split.hasPresentation).toBe(true);

    // Verify segments exist and contain both presentations
    const presentationSegments = split.segments.filter(s => s.type === 'presentation');
    expect(presentationSegments.length).toBe(2);

    const firstDeckSeg = presentationSegments[0] as any;
    const secondDeckSeg = presentationSegments[1] as any;

    // First presentation deck validation
    expect(firstDeckSeg.title).toBe('Elon Musk');
    expect(firstDeckSeg.slideDeck.slides.length).toBe(3); // 1 title + 2 content slides (NOT merged with second deck!)
    expect(firstDeckSeg.slideDeck.slides[1].title).toBe('Early Life and Education');
    expect(firstDeckSeg.slideDeck.slides[2].title).toBe('Founding SpaceX');
    expect(firstDeckSeg.rawMarkdown).toContain('Early Life and Education');
    expect(firstDeckSeg.rawMarkdown).not.toContain('Tesla: Accelerating Clean Energy');

    // Second presentation deck validation
    expect(secondDeckSeg.title).toBe('Tesla: Accelerating Clean Energy');
    expect(secondDeckSeg.slideDeck.slides.length).toBe(3); // 1 title + 2 content slides (NOT merged with first deck!)
    expect(secondDeckSeg.slideDeck.slides[1].title).toBe('Tesla Roadster and Model S');
    expect(secondDeckSeg.slideDeck.slides[2].title).toBe('Energy and Storage');
    expect(secondDeckSeg.rawMarkdown).toContain('Tesla Roadster and Model S');
    expect(secondDeckSeg.rawMarkdown).not.toContain('Early Life and Education');

    // Text segments validation
    const textSegments = split.segments.filter(s => s.type === 'text');
    expect(textSegments.length).toBe(3);
    // 1. Initial greeting
    expect((textSegments[0] as any).content).toContain('হ্যাঁ, আমি ভালো আছি');
    // 2. Chat between presentations
    expect((textSegments[1] as any).content).toContain('আমি আপনার জন্য এলন মাস্কের প্রথম প্রেজেন্টেশনটি');
    expect((textSegments[1] as any).content).toContain('বলুন, আপনার জন্য আর কী করতে পারি?');
    // 3. Outro after second presentation
    expect((textSegments[2] as any).content).toContain('আমি আপনার জন্য টেসলার দ্বিতীয় প্রেজেন্টেশনটিও তৈরি করে স্ক্রিনে দিয়েছি');

    // Verify NONE of the text segments contain raw slide content of either presentation
    for (const t of textSegments) {
      expect((t as any).content).not.toContain('## Early Life and Education');
      expect((t as any).content).not.toContain('## Tesla Roadster and Model S');
    }
  });

  it('correctly handles blockquotes, italics, and excludes How to get your file from slides', () => {
    const rawAiResponse = `
Here is the clean, refined version of your presentation, ready for your use.

# Durga Puja: The Eternal Festival of Shakti
## A Comprehensive Cultural Overview

---

## A Prayer of Renewal 🙏
> *"Ya Devi Sarvabhuteshu, Shakti-rupena samsthita,*
> *Namastasyai, Namastasyai, Namastasyai, Namo Namah."*
>
> **Translation:** "To the Goddess who resides in all beings in the form of power, I bow to Her, again and again."

*   **Asche Bochor Abar Hobe:** The eternal promise that the joy of the festival will return next year.

---

### How to get your file:
Your presentation is now perfectly formatted and ready.
- To Download: Look at the presentation card header above this message and click the Download .pptx button.
- To Change Themes: You can use the Theme button on the presentation card header to switch to other styles (like Navy & Gold or Modern Light) instantly without affecting the content!
`;

    const split = splitPresentationContent(rawAiResponse);
    expect(split.hasPresentation).toBe(true);
    expect(split.slideDeck).not.toBeNull();
    // Exactly 2 slides (1 title + 1 content slide) - "How to get your file" must NOT be a slide!
    expect(split.slideDeck?.slides.length).toBe(2);
    expect(split.slideDeck?.slides.some(s => s.title.toLowerCase().includes('how to get your file'))).toBe(false);

    // Slide 2 must contain the cleaned prayer shloka without '>' or broken empty lines
    const contentSlide = split.slideDeck?.slides[1];
    expect(contentSlide?.title).toBe('A Prayer of Renewal 🙏');
    expect(contentSlide?.paragraphs.length).toBe(3);
    expect(contentSlide?.paragraphs[0]).toContain('Ya Devi Sarvabhuteshu');
    expect(contentSlide?.paragraphs[0]).not.toContain('>');
    expect(contentSlide?.paragraphs[1]).toContain('Namastasyai');
    expect(contentSlide?.paragraphs[2]).toContain('Translation:');
    expect(contentSlide?.bullets.length).toBe(1);
    expect(contentSlide?.bullets[0]).toContain('Asche Bochor Abar Hobe');

    // "How to get your file" must be cleanly routed to bottomText
    expect(split.bottomText).toContain('How to get your file:');
    expect(split.bottomText).toContain('Download .pptx button');
    expect(split.bottomText).toContain('To Change Themes:');

    // Outline must NOT contain "How to get your file"
    expect(split.slideOutline).not.toContain('How to get your file');

    // PowerPoint export must successfully produce a valid PPTX blob with both paragraphs and bullets
    const pptxBlob = exportMarkdownToPptx(rawAiResponse);
    expect(pptxBlob).toBeDefined();
  });

  it('correctly transliterates Unicode box drawing characters and symbols to ASCII', () => {
    const rawBox = `
┌───────────────────────────────────────┐
│   Complete Phase 1 & 2 Foundations    │
└───────────────────────────────────────┘
                    │
                    ▼
┌───────────────────┬───────────────────┐
│ Track A: Data     │ Track B: Web      │
└───────────────────┴───────────────────┘
`;
    const transliterated = transliterateUnicodeSymbols(rawBox);
    // Must NOT contain any Unicode box-drawing or downward triangles
    expect(transliterated).not.toContain('┌');
    expect(transliterated).not.toContain('─');
    expect(transliterated).not.toContain('│');
    expect(transliterated).not.toContain('▼');
    // Must contain clean ASCII replacements
    expect(transliterated).toContain('+');
    expect(transliterated).toContain('-');
    expect(transliterated).toContain('|');
    expect(transliterated).toContain('v');
  });

  it('exports wide code blocks and ASCII diagrams to PDF and Word without throwing or corrupting', async () => {
    const roadmapMd = `
# Comprehensive Python Mastery Roadmap

## Phase 3: Choose Your Specialization Track (Weeks 9-16)

\`\`\`bash
┌───────────────────────────────────────────────────────────────────────────────┐
│                      Complete Phase 1 & 2 Foundations                         │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Track A: Data     │ Track B: Web      │ Track C:          │ Track D: AI &     │
│ Science & Data    │ Development       │ Automation &      │ Machine           │
│ Engineering       │                   │ Web Scraping      │ Learning          │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘
\`\`\`

\`\`\`bash
python -m venv venv
source venv/bin/activate  # On macOS/Linux
venv\\Scripts\\activate     # On Windows
pip install -r requirements.txt
\`\`\`
`;

    const pdfBlob = await exportMarkdownToPdf(roadmapMd, { title: 'Comprehensive Python Mastery' });
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(1000);
    expect(pdfBlob.type).toContain('application/pdf');

    const docxBlob = await exportMarkdownToDocx(roadmapMd, { title: 'Comprehensive Python Mastery' });
    expect(docxBlob).toBeDefined();
    expect(docxBlob.size).toBeGreaterThan(1000);
    expect(docxBlob.type).toContain('wordprocessingml.document');
  });

  it('safely separates presentation slides from subsequent Mermaid diagrams, ASCII image previews, and doc download instructions', async () => {
    const multiFormatResponse = `
I can provide all of those formats for you right now. Below, you will find an interactive **PowerPoint Presentation**, a **Mermaid Diagram** with an **ASCII Visual Preview**, and instructions on how to export the **Word (.docx)** and **PDF** versions.

1. PowerPoint Presentation (Interactive)

# Python Learning Roadmap
## Zero to Hero in 2026

---

### Phase 1: Foundations
- Core Syntax, Variables, Data Types
- Control Flow: if/else, loops (for, while)
- Functions, Scope, and Recursion

---

### Phase 2: Data Structures & OOP
- Lists, Dictionaries, Sets, Tuples
- Object-Oriented Programming (Classes, Methods, Inheritance)
- Exception Handling and Custom Errors

---

### Phase 3: Professional Workflow
- Git & GitHub for Version Control
- Virtual Environments (venv, poetry)
- Unit Testing with pytest and Type Hinting

---

### Phase 4: Specialization
- Web: FastAPI, Django
- Data Science: Pandas, NumPy
- AI: PyTorch, Hugging Face

---

### Summary & Next Steps
This code represents the flow of your learning journey.

2. Mermaid Diagram
\`\`\`mermaid
graph TD
Start((START)) --> P1[Phase 1: Foundations]
P1 --> P2[Phase 2: Data & OOP]
P2 --> P3[Phase 3: Professional Workflow]
P3 --> P4{Phase 4: Specialization}
P4 --> WEB[Web Dev]
P4 --> DS[Data Science]
P4 --> AI[AI & ML]
\`\`\`

3. Image Preview (ASCII Visual)
If you cannot render the Mermaid diagram, here is the visual layout:

\`\`\`text
[ START ]
   |
   v
+-----------------------+
| PHASE 1: FOUNDATIONS  |--> (Syntax, Loops, Functions)
+-----------------------+
   |
   v
+-----------------------+
| PHASE 2: DATA & OOP   |--> (Lists, Dicts, Classes)
+-----------------------+
\`\`\`

How to download your files:
- For the PowerPoint (.pptx): Your interactive presentation is ready in the card above. You can swipe through the slides, change colors with the Theme button, and download the file by clicking Download .pptx on the presentation card header.
- For the Word Document (.docx) or PDF: Click the Export (📥) button in the action bar below this message and select your preferred format.
- For Data Tables: If I provide a table, you can hover over it and click the download icon to save it as Excel (.xlsx) or CSV.

Which phase would you like to explore in more detail first?
`;

    const split = splitPresentationContent(multiFormatResponse);
    expect(split.hasPresentation).toBe(true);
    expect(split.topText).toContain('1. PowerPoint Presentation (Interactive)');
    expect(split.topText).toContain('Below, you will find an interactive');

    // Slide deck must have EXACTLY 6 slides (1 title + 5 content slides)
    expect(split.slideDeck).not.toBeNull();
    if (!split.slideDeck) throw new Error('Expected slideDeck to be defined');
    expect(split.slideDeck.slides.length).toBe(6);

    // Slide 6 must be "Summary & Next Steps" with ONLY its genuine slide paragraph
    const slide6 = split.slideDeck.slides[5];
    expect(slide6.title).toBe('Summary & Next Steps');
    expect(slide6.paragraphs.length).toBe(1);
    expect(slide6.paragraphs[0]).toBe('This code represents the flow of your learning journey.');

    // Slide 6 must NOT contain any Mermaid code or ASCII art!
    expect(slide6.paragraphs.some(p => p.includes('mermaid') || p.includes('graph TD') || p.includes('START') || p.includes('+--'))).toBe(false);
    expect(slide6.bullets.some(b => b.includes('mermaid') || b.includes('ASCII'))).toBe(false);

    // Slide outline must only contain slides and NOT contain subsequent sections
    expect(split.slideOutline).toContain('# Python Learning Roadmap');
    expect(split.slideOutline).toContain('### Summary & Next Steps');
    expect(split.slideOutline).not.toContain('2. Mermaid Diagram');
    expect(split.slideOutline).not.toContain('3. Image Preview');
    expect(split.slideOutline).not.toContain('How to download your files:');

    // Bottom text must cleanly start with 2. Mermaid Diagram and contain all remaining deliverables
    expect(split.bottomText).toContain('2. Mermaid Diagram');
    expect(split.bottomText).toContain('graph TD');
    expect(split.bottomText).toContain('3. Image Preview (ASCII Visual)');
    expect(split.bottomText).toContain('PHASE 1: FOUNDATIONS');
    expect(split.bottomText).toContain('How to download your files:');
    expect(split.bottomText).toContain('Which phase would you like to explore');

    // PowerPoint export must successfully produce a valid PPTX blob with 6 clean slides
    const pptxBlob = await exportMarkdownToPptx(multiFormatResponse);
    expect(pptxBlob).toBeDefined();
    expect(pptxBlob.size).toBeGreaterThan(500);
  });

  it('correctly parses and exports slides containing code blocks without raw backticks or overlap', async () => {
    const codePresentationMd = `
1. Premium Python Mastery Presentation

# The Python Mastery Blueprint
A fast-track guide to Python architecture and modern engineering

---

### Phase 2: Architecture
#### Structuring Complex Data
- Key Concept: Writing clean, reusable functions
- Object-oriented principles applied to domain modeling

\`\`\`python
class Robot:
    def __init__(self, name: str):
        self.name = name

    def work(self):
        print(f"{self.name} is processing data...")

my_bot = Robot("Sree-01")
\`\`\`

---

### Phase 4: Specialization
#### Real-World Application
- Example: Data Science with Pandas
- Example: Web development with FastAPI

\`\`\`python
import pandas as pd

data = {'Name': ['A', 'B'], 'Score': [90, 85]}
df = pd.DataFrame(data)
\`\`\`
    `;

    // 1. Test parsing logic
    const parsed = parseMarkdownToSlides(codePresentationMd);
    expect(parsed.slides.length).toBe(2);

    // Slide 1 checks
    const slide1 = parsed.slides[0];
    expect(slide1.title).toBe('Phase 2: Architecture');
    expect(slide1.codeSnippet).toBeDefined();
    expect(slide1.codeSnippet?.language).toBe('python');
    expect(slide1.codeSnippet?.code).toContain('class Robot:');
    expect(slide1.codeSnippet?.code).toContain('my_bot = Robot("Sree-01")');
    // Ensure raw backticks and code lines are stripped from paragraphs and bullets!
    expect(slide1.paragraphs.some(p => p.includes('```'))).toBe(false);
    expect(slide1.bullets.some(b => b.includes('```'))).toBe(false);
    expect(slide1.paragraphs.some(p => p.includes('class Robot'))).toBe(false);

    // Slide 2 checks
    const slide2 = parsed.slides[1];
    expect(slide2.title).toBe('Phase 4: Specialization');
    expect(slide2.codeSnippet).toBeDefined();
    expect(slide2.codeSnippet?.language).toBe('python');
    expect(slide2.codeSnippet?.code).toContain('import pandas as pd');
    expect(slide2.codeSnippet?.code).toContain('df = pd.DataFrame(data)');
    expect(slide2.paragraphs.some(p => p.includes('```'))).toBe(false);
    expect(slide2.bullets.some(b => b.includes('```'))).toBe(false);

    // 2. Test splitPresentationContent extraction for web carousel
    const split = splitPresentationContent(codePresentationMd);
    expect(split.hasPresentation).toBe(true);
    expect(split.slideDeck).not.toBeNull();
    const carouselSlide1 = split.slideDeck!.slides[1]; // Slide index 1 (after Title slide)
    expect(carouselSlide1.codeSnippet).toBeDefined();
    expect(carouselSlide1.codeSnippet?.language).toBe('python');
    expect(carouselSlide1.codeSnippet?.code).toContain('class Robot:');

    // 3. Test PPTX export execution
    const blob = await exportMarkdownToPptx(codePresentationMd, {
      title: 'The Python Mastery Blueprint',
    });
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(500);
  });

  it('correctly cleans title prefixes like "04 | " and displays DIAGRAM for ASCII hierarchy flowcharts', () => {
    // 1. Title prefix cleaning
    expect(cleanSlideTitle('04 | Skill Hierarchy Diagram')).toBe('Skill Hierarchy Diagram');
    expect(cleanSlideTitle('### 04 | Skill Hierarchy Diagram')).toBe('Skill Hierarchy Diagram');
    expect(cleanSlideTitle('04 - Skill Hierarchy Diagram')).toBe('Skill Hierarchy Diagram');
    expect(cleanSlideTitle('04: Skill Hierarchy Diagram')).toBe('Skill Hierarchy Diagram');
    expect(cleanSlideTitle('4. Foundations of Architecture')).toBe('Foundations of Architecture');
    expect(cleanSlideTitle('Slide 05: Data Engineering')).toBe('Data Engineering');

    // 2. Badge label detection for ASCII diagrams vs real code
    const asciiHierarchy = `
[ DOMAIN EXPERTISE ]
^
|
[ SOFTWARE ENGINEERING ]
^
|
[ DATA ARCHITECTURE ]
^
|
[ BASIC SYNTAX ]
    `;
    expect(getSlideCodeBadge('text', asciiHierarchy)).toBe('DIAGRAM');
    expect(getSlideCodeBadge('txt', asciiHierarchy)).toBe('DIAGRAM');
    expect(getSlideCodeBadge('', asciiHierarchy)).toBe('DIAGRAM');

    const boxDiagram = `
+-----------------------------------+
|    PYTHON ARCHITECTURE HIERARCHY   |
+-----------------------------------+
                  |
                  v
    `;
    expect(getSlideCodeBadge('text', boxDiagram)).toBe('DIAGRAM');

    // Real code languages should retain their uppercase name
    expect(getSlideCodeBadge('python', 'import pandas as pd')).toBe('PYTHON');
    expect(getSlideCodeBadge('typescript', 'const x: number = 42;')).toBe('TYPESCRIPT');

    // Plain text without diagram symbols (even containing hyphens or the letter 'v')
    expect(getSlideCodeBadge('text', 'Just a standard text note without arrows or boxes.')).toBe('CODE');
    expect(getSlideCodeBadge('text', 'Create a visionary presentation about high-impact topics.')).toBe('CODE');
  });

  it('correctly resolves smart code badges for prompts, plain text, code, and diagrams', () => {
    // 1. PPT / Presentation generation prompt (as in user screenshot 1)
    const gammaPptPrompt = `
Create a professional, futuristic, and high-impact 8-slide presentation about Elon Musk, the visionary entrepreneur...
Structure the slides as follows:
1. Title Slide: Elon Musk: The Visionary Disruptor of Industries.
2. Early Life & Education: ...
Tone: Professional, inspiring, and minimalist.
Visual Style: Use a sleek, dark-themed executive design with high-quality photography
    `;
    const pptBadge = resolveCodeBadge('text', gammaPptPrompt);
    expect(pptBadge.label).toBe('PPT Prompt');
    expect(pptBadge.isDiagram).toBe(false);

    // 2. Bug Fix prompt (as in ChatGPT screenshot 2)
    const bugFixPrompt = `
I have a bug in my text input/chat input UI.
When I type continuously, the text field starts flickering/re-rendering while characters are being entered.
Please inspect the code and fix the root cause, not just hide the visual flicker.
Expected behavior:
• The input should remain visually stable while typing.
    `;
    const bugBadge = resolveCodeBadge('text', bugFixPrompt);
    expect(bugBadge.label).toBe('Bug Fix Prompt');
    expect(bugBadge.isDiagram).toBe(false);

    // 3. Plain Text (general prose note without prompts or diagrams)
    const plainTextNote = 'This is a simple plain text note for the user documentation.';
    const plainBadge = resolveCodeBadge('text', plainTextNote);
    expect(plainBadge.label).toBe('Plain Text');
    expect(plainBadge.isDiagram).toBe(false);

    // 4. Genuine ASCII diagram
    const asciiBox = `
+-----------------------------------+
|    PYTHON ARCHITECTURE HIERARCHY   |
+-----------------------------------+
                  |
                  v
    `;
    const diagramBadge = resolveCodeBadge('text', asciiBox);
    expect(diagramBadge.label).toBe('Diagram');
    expect(diagramBadge.isDiagram).toBe(true);

    // 5. Explicit markdown tags
    expect(resolveCodeBadge('ppt-prompt', 'anything').label).toBe('PPT Prompt');
    expect(resolveCodeBadge('bug-fix-prompt', 'anything').label).toBe('Bug Fix Prompt');
    expect(resolveCodeBadge('python', 'print("hello")').label).toBe('Python');
    expect(resolveCodeBadge('typescript', 'const a = 1;').label).toBe('TypeScript');
  });

  it('preserves exact indentation and centered arrows in slide ASCII diagrams', () => {
    const rawHierarchyPresentation = `
1. Premium Python Mastery Presentation

# The Python Mastery Blueprint
A fast-track guide to Python architecture and modern engineering

---

### Skill Hierarchy Diagram
- The Path to Seniority

\`\`\`text
      [ DOMAIN EXPERTISE ]
               ^
               |
    [ SOFTWARE ENGINEERING ]
               ^
               |
      [ DATA ARCHITECTURE ]
               ^
               |
     [ CORE LOGIC & FLOW ]
               ^
               |
        [ BASIC SYNTAX ]
\`\`\`
    `;

    const parsed = parseMarkdownToSlides(rawHierarchyPresentation);
    expect(parsed.slides.length).toBe(1);
    const slide = parsed.slides[0];
    expect(slide.title).toBe('Skill Hierarchy Diagram');
    expect(slide.codeSnippet).toBeDefined();

    // Verify leading spaces on centered arrows '^' and '|' are strictly preserved!
    const lines = slide.codeSnippet!.code.split('\n');
    expect(lines[0]).toBe('      [ DOMAIN EXPERTISE ]');
    expect(lines[1]).toBe('               ^');
    expect(lines[2]).toBe('               |');
    expect(lines[3]).toBe('    [ SOFTWARE ENGINEERING ]');
    expect(lines[1].startsWith('               ^')).toBe(true);
    expect(lines[1].length).toBeGreaterThan(10);
  });

  describe('Adaptive Code & Diagram Layout Containment', () => {
    it('preserves large executive typography and generous spacing for short code blocks (<= 6 lines)', () => {
      const layout = calculateAdaptiveCodeLayout(5, false, 1.85, true);
      // Font size must stay large and readable
      expect(layout.codeFontSize).toBeGreaterThanOrEqual(13.0);
      expect(layout.lineSpacingVal).toBeGreaterThanOrEqual(20);
      // Card height wraps snugly without stretching to slide bottom
      expect(layout.codeCardH).toBeLessThan(3.0);
      // Text must be fully contained within card
      expect(layout.actualTextH + layout.topOffset).toBeLessThan(layout.codeCardH);
    });

    it('dynamically constrains tall 25-line ASCII architecture diagrams so text NEVER spills out of card or overlaps slide footer', () => {
      const currentY = 1.85;
      const layout = calculateAdaptiveCodeLayout(25, true, currentY, true);

      // Card must stay well clear of the slide footer (footer at y=6.72)
      expect(currentY + layout.codeCardH).toBeLessThanOrEqual(6.65);

      // The text MUST fit 100% inside the card container with breathing room
      const textBottom = layout.topOffset + layout.actualTextH;
      expect(textBottom).toBeLessThan(layout.codeCardH);

      // Bottom padding gap must be at least 0.20 inches
      expect(layout.codeCardH - textBottom).toBeGreaterThanOrEqual(0.20);

      // Font size and line spacing scaled down smoothly
      expect(layout.codeFontSize).toBeLessThanOrEqual(9.5);
      expect(layout.codeFontSize).toBeGreaterThanOrEqual(7.0);
      expect(layout.lineSpacingVal).toBeLessThanOrEqual(13.5);
      expect(layout.lineSpacingVal).toBeGreaterThanOrEqual(9.5);
    });

    it('safely constrains extreme 35-line diagrams in full-width mode without overflowing', () => {
      const currentY = 1.80;
      const layout = calculateAdaptiveCodeLayout(35, true, currentY, false);

      expect(currentY + layout.codeCardH).toBeLessThanOrEqual(7.05);
      const textBottom = layout.topOffset + layout.actualTextH;
      expect(textBottom).toBeLessThanOrEqual(layout.codeCardH);
      expect(layout.codeFontSize).toBeGreaterThanOrEqual(5.5);
    });

    it('exports hero layout slide with 0 bullets, intro paragraph, and 25-line diagram to valid PPTX', async () => {
      const heroSlideMd = `
# The Python Mastery Blueprint
Executive Guide

---

### The Hierarchy of Mastery
Before diving into code, it is essential to understand the structural layers of a Python expert.

\`\`\`text
+------------------------------------+
|    PYTHON ARCHITECTURE HIERARCHY   |
+------------------------------------+
                  |
                  v
+------------------------------------+
|      LEVEL 4: DOMAIN SPECIALIST    |
| (AI, Web, Data Science, Robotics)  |
+------------------------------------+
                  |
                  v
+------------------------------------+
|     LEVEL 3: SOFTWARE ENGINEER     |
|  (Git, Testing, Env, Clean Code)   |
+------------------------------------+
                  |
                  v
+------------------------------------+
|       LEVEL 2: DATA ARCHITECT      |
| (OOP, Data Structures, Algorithms) |
+------------------------------------+
                  |
                  v
+------------------------------------+
|       LEVEL 1: CORE DEVELOPER      |
|    (Syntax, Logic, Functions, IO)  |
+------------------------------------+
\`\`\`
      `;

      const parsed = parseMarkdownToSlides(heroSlideMd);
      expect(parsed.slides.length).toBe(1);
      const slide = parsed.slides[0];
      expect(slide.title).toBe('The Hierarchy of Mastery');
      expect(slide.bullets.length).toBe(0);
      expect(slide.paragraphs.length).toBe(1);
      expect(slide.codeSnippet).toBeDefined();

      const blob = await exportMarkdownToPptx(heroSlideMd, {
        title: 'The Python Mastery Blueprint',
        showWatermark: false,
      });

      expect(blob).toBeDefined();
      expect(blob.size).toBeGreaterThan(1000);
      expect(blob.type).toMatch(/(presentation|zip)/i);
    });
    it('captures conclusion and call-to-action slides even if the AI omitted a divider before the final slide', () => {
      const markdownWithoutDivider = `I have updated your deck.

<!-- theme: executiveDark -->

# Scaling to 10x: Our Future
## Transforming from a Boutique Agency to a High-Output Engine

---

## The 10x Vision: Why Now?
- The Market Gap: Clients want rapid business results.
- The Scaling Problem: Traditional bespoke work is slow.

---

## Conclusion: The New Standard
- Speed is a Feature: Fastest company wins.
- Quality is Non-Negotiable: Automation guarantees quality.

## Final Call to Action
- Commit to the System: Stop being task-doers and start being system-builders.
- Identify Your First 10x Opportunity: Submit one process by Friday.

How to get your presentation:
Click Download .pptx above to get your file!`;

      const result = splitPresentationContent(markdownWithoutDivider);
      expect(result.hasPresentation).toBe(true);
      expect(result.slideDeck).not.toBeNull();
      
      const slideTitles = result.slideDeck?.slides.map(s => s.title) || [];
      expect(slideTitles).toContain('Scaling to 10x: Our Future');
      expect(slideTitles).toContain('The 10x Vision: Why Now?');
      expect(slideTitles).toContain('Conclusion: The New Standard');
      expect(slideTitles).toContain('Final Call to Action');
      
      // Bottom text should only have the download guidance, NOT the Call to Action slide
      expect(result.bottomText).toContain('How to get your presentation:');
      expect(result.bottomText).not.toContain('Final Call to Action');
      expect(result.bottomText).not.toContain('Commit to the System');
      
      // Top text should be clean intro text without raw theme directive
      expect(result.topText).toBe('I have updated your deck.');
      expect(result.topText).not.toContain('theme:');
    });

    it('strips theme directives and standalone placeholder images from topText and bottomText without breaking deck extraction', () => {
      const markdownWithLogoPlaceholder = `Here is your branded deck:

<!-- theme: modernLight -->
![Logo](https://placehold.co/400x120/0f172a/38bdf8?text=YOUR+LOGO+HERE)

# Brand Presentation
## Subtitle

---

## Slide 1
- Point 1
- Point 2

---

## Final Slide
![Logo](https://placehold.co/400x120/0f172a/38bdf8?text=LOGO)
- Action item

To download your presentation:
Click download.`;

      const result = splitPresentationContent(markdownWithLogoPlaceholder);
      expect(result.hasPresentation).toBe(true);
      expect(result.slideDeck?.slides.length).toBe(3); // Title + Slide 1 + Final Slide
      
      // topText must NOT contain the theme tag or the raw image link
      expect(result.topText).toBe('Here is your branded deck:');
      expect(result.topText).not.toContain('<!-- theme:');
      expect(result.topText).not.toContain('YOUR+LOGO+HERE');
      
      // bottomText must NOT contain the image tag or theme tag
      expect(result.bottomText).toContain('To download your presentation:');
      expect(result.bottomText).not.toContain('YOUR+LOGO+HERE');

      // Verify logo flags are passed to SlideDeck
      expect(result.slideDeck?.slides[0].hasLogoPlaceholder).toBe(true);
      expect(result.slideDeck?.slides[2].hasLogoPlaceholder).toBe(true);
      expect(result.slideDeck?.slides[2].bullets).not.toContain('!Logo');
    });

    it('generates valid PowerPoint blob with embedded logo placeholder pictures for Change Picture workflow', async () => {
      const brandedDeck = `<!-- theme: executiveDark -->
![COMPANY LOGO](https://example.com/logo.png)

# 10x Innovation
## Transforming the Enterprise

---

## Strategy & Vision
- Elite automation tools
- Faster time to market

---

## Final Call to Action
![COMPANY LOGO](https://example.com/logo.png)
- Schedule briefing by Friday`;

      const parsed = parseMarkdownToSlides(brandedDeck);
      expect(parsed.hasTitleLogo).toBe(true);
      expect(parsed.slides[1].hasLogoPlaceholder).toBe(true);
      expect(parsed.slides[1].bullets).toEqual(['Schedule briefing by Friday']);

      const deck = extractSlideDeck(brandedDeck);
      expect(deck).not.toBeNull();
      expect(deck?.slides[0].hasLogoPlaceholder).toBe(true);
      expect(deck?.slides[2].hasLogoPlaceholder).toBe(true);

      const pptxBlob = await exportMarkdownToPptx(brandedDeck);
      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentation');
    });

    it('extracts real logoUrl and keeps Final Call to Action slide with PLACE LOGO HERE inside the presentation', async () => {
      const markdown = `Here is your requested 11-slide presentation:

[PLACE LOGO HERE]

# Scaling to 10x: Our Future
## Transforming Operations with AI

---

## Conclusion: The New Standard
- Speed is a Feature: In a digital world, the fastest company wins.
- Quality is Non-Negotiable: Automation doesn't replace quality.
- Our Promise: Scaling productivity creates stability.

---

## Final Call to Action
[PLACE LOGO HERE]
- Commit to the System: Today we stop being task-doers and start being system-builders.
- Identify Your First 10x Opportunity: Submit one process you believe we can automate.
- Let's Build: We are building a world-class production engine.
- Questions? Open floor for discussion.

To download your presentation, click the Download .pptx button above.`;

      const split = splitPresentationContent(markdown);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).not.toBeNull();
      
      // Should have exactly 3 slides: Title + Conclusion + Final Call to Action
      expect(split.slideDeck?.slides.length).toBe(3);
      
      const lastSlide = split.slideDeck?.slides[2];
      expect(lastSlide?.title).toBe('Final Call to Action');
      expect(lastSlide?.hasLogoPlaceholder).toBe(true);
      expect(lastSlide?.bullets.length).toBe(4);
      expect(lastSlide?.bullets[0]).toContain('Commit to the System');
      expect(lastSlide?.bullets[1]).toContain('Identify Your First 10x Opportunity');
      expect(lastSlide?.bullets[2]).toContain("Let's Build");
      expect(lastSlide?.bullets[3]).toContain('Questions?');

      // Crucial: [PLACE LOGO HERE] must NOT leak into topText or bottomText!
      expect(split.topText).toBe('Here is your requested 11-slide presentation:');
      expect(split.topText).not.toContain('PLACE LOGO HERE');
      expect(split.bottomText).toContain('To download your presentation');
      expect(split.bottomText).not.toContain('PLACE LOGO HERE');
      expect(split.bottomText).not.toContain('Final Call to Action');
      expect(split.bottomText).not.toContain('Commit to the System');

      // Verify real logoUrl extraction when explicit image URL is provided
      const deckWithRealLogoUrl = `<!-- theme: modernLight -->
![My Company](https://cdn.example.com/assets/logo.png)
# Enterprise Growth
## Quarterly Update

---

## Next Steps
![Next Step Logo](https://cdn.example.com/assets/next.png)
- Execute strategy`;

      const parsedWithUrl = parseMarkdownToSlides(deckWithRealLogoUrl);
      expect(parsedWithUrl.titleLogoUrl).toBe('https://cdn.example.com/assets/logo.png');
      expect(parsedWithUrl.slides[0].logoUrl).toBe('https://cdn.example.com/assets/next.png');

      const extractedDeck = extractSlideDeck(deckWithRealLogoUrl);
      expect(extractedDeck?.slides[0].logoUrl).toBe('https://cdn.example.com/assets/logo.png');
      expect(extractedDeck?.slides[1].logoUrl).toBe('https://cdn.example.com/assets/next.png');
    });

    it('prevents presentation cut-offs when AI omits dividers between numbered sections and strips floating logos from topText', () => {
      const rawAiResponse = `<!-- theme: modernLight -->
I have updated your presentation to include your logo.

![Brand Logo](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/1792777548493-bivdqhqac4.ico)

# Execution Starts Now
## Let's Build the Future of Automation

---

## 2. Delivery Velocity
Since you offer Web Development and Automation, your productivity is tied to your Delivery Velocity.
- The "Internal Product" Approach: Treat your internal tools as your most important client.
- Code Reusability: Build a private repository of "Golden Components".
- AI Integration: Mandate the use of AI coding assistants.

3. Service Automation (The "Productized Service" Model)
To scale, you must move away from "bespoke work for every client".
- Templatized Scoping: Create a standardized menu of services.
- Automated Client Portals: Give clients a dashboard.
- Automated Reporting: Use tools like Zapier or Make.com.

4. Building the Team
- Hire for Culture, Train for Skill: It is easier to teach a developer your stack.
- The "Squad" Model: Organize your team into small cross-functional squads.
- Incentivize Velocity: Reward teams based on project completion times.

To download your presentation, click Download .pptx on the presentation card header.`;

      const split = splitPresentationContent(rawAiResponse);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).not.toBeNull();

      // Must capture all 4 slides: Title + Section 2 + Section 3 + Section 4 (NOT cutting off at slide 2!)
      expect(split.slideDeck?.slides.length).toBe(4);
      expect(split.slideDeck?.slides[0].title).toBe('Execution Starts Now');
      expect(split.slideDeck?.slides[0].hasLogoPlaceholder).toBe(true);
      expect(split.slideDeck?.slides[0].logoUrl).toBe('https://pub-43593f37b89642548243a2b1f468120e.r2.dev/1792777548493-bivdqhqac4.ico');
      
      expect(split.slideDeck?.slides[1].title).toBe('Delivery Velocity');
      expect(split.slideDeck?.slides[2].title).toContain('Service Automation');
      expect(split.slideDeck?.slides[3].title).toContain('Building the Team');

      // Crucial: topText must NOT contain the floating Brand Logo image!
      expect(split.topText).toContain('I have updated your presentation to include your logo.');
      expect(split.topText).not.toContain('![Brand Logo]');
      expect(split.topText).not.toContain('bivdqhqac4.ico');

      // Outline contains all slides
      expect(split.slideOutline).toContain('Building the Team');
      expect(split.slideOutline).toContain('Service Automation');

      // Bottom text has download instructions cleanly separated
      expect(split.bottomText).toContain('To download your presentation');
    });

    it('cleanFallbackTitle properly sanitizes conversational user prompts', () => {
      // Rejects long prompts or questions
      expect(cleanFallbackTitle('plan properly and give me how can i be a ceo of a new company and 10x the productivity')).toBe('');
      expect(cleanFallbackTitle('give me 10 slides on python?')).toBe('');
      expect(cleanFallbackTitle('how to scale an agency')).toBe('');
      expect(cleanFallbackTitle('can you create a pitch deck for my startup')).toBe('');
      expect(cleanFallbackTitle('ok so give ppt to explain the process')).toBe('');

      // Retains genuine short titles
      expect(cleanFallbackTitle('CEO Roadmap')).toBe('CEO Roadmap');
      expect(cleanFallbackTitle('Executive Summary')).toBe('Executive Summary');
      expect(cleanFallbackTitle('Q3 Financial Overview')).toBe('Q3 Financial Overview');
    });

    it('extracts genuine slide heading for Slide 1 and file name instead of user prompt fallbackTitle', () => {
      const rawUserPrompt = 'plan properly and give me how can i be a ceo of a new company and 10x the productivity it is a service base productivity, we offer bussiness webdev and custom automated solutions for there bussiness with my brand logo ok so give ppt to explain the process how we can boost 10x to my employs';

      const markdownDeck = `---
### Slide 1: Title Slide
![Company Logo](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/1792777548493-bivdqhqac4.ico)
**CEO Roadmap: Scaling Your Service-Based Company**
*10x Productivity: The Path to Scaling Service Excellence*
---
### Slide 2: Strategic Foundation
- Build SOPs for all recurring tasks
- Productize custom web development packages
- Automate client onboarding
---
### Slide 3: Delivery Velocity
- Component libraries reduce build time
- Automated testing prevents regression
---`;

      const parsed = parseMarkdownToSlides(markdownDeck, rawUserPrompt);

      // The presentation title must be the genuine heading, NOT the user prompt!
      expect(parsed.title).toBe('CEO Roadmap: Scaling Your Service-Based Company');
      expect(parsed.subtitle).toBe('10x Productivity: The Path to Scaling Service Excellence');
      expect(parsed.hasTitleLogo).toBe(true);
      expect(parsed.titleLogoUrl).toBe('https://pub-43593f37b89642548243a2b1f468120e.r2.dev/1792777548493-bivdqhqac4.ico');

      const split = splitPresentationContent(markdownDeck, rawUserPrompt);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck?.title).toBe('CEO Roadmap: Scaling Your Service-Based Company');
      expect(split.slideDeck?.slides[0].title).toBe('CEO Roadmap: Scaling Your Service-Based Company');
      expect(split.slideDeck?.slides[0].subtitle).toBe('10x Productivity: The Path to Scaling Service Excellence');
      expect(split.segments.find(s => s.type === 'presentation')?.title).toBe('CEO Roadmap: Scaling Your Service-Based Company');
    });

    it('accurately isolates logo placeholders to Slide 1 and Closing Slide without polluting content slides', async () => {
      const fullResponse = `
Here is your strategic vision and presentation deck.

Part 1: Strategy Guide
- Focus on automation
- Build productized services

---
### Slide 1: The Path to 10x Productivity
![Sree AI](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/sree-ai.png)
**The Path to 10x Productivity**
*Scaling Excellence in Web Development & Automation*
---
### Slide 2: Strategic Foundation
- Build SOPs for all recurring tasks
- Productize custom web development packages
---
### Slide 3: Delivery Velocity
- Component libraries reduce build time
- Automated testing prevents regression
---
### Slide 4: Client Success
- Deliver ahead of deadlines
- Measure NPS weekly
---
### Slide 5: Let's Build the Future
![Sree AI](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/sree-ai.png)
**Let's Build the Future**
- Together
- Let's innovate, automate, and dominate.
---

How to download your files:
1. Preview the slides above.
2. Click Download .pptx.
      `;

      const split = splitPresentationContent(fullResponse);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).toBeDefined();

      const slides = split.slideDeck!.slides;
      expect(slides.length).toBe(5);

      // Slide 1 (Title slide) MUST request logo
      expect(slides[0].isTitleSlide).toBe(true);
      expect(slides[0].hasLogoPlaceholder).toBe(true);

      // Slides 2, 3, 4 (Content slides) MUST NOT request logo
      expect(slides[1].isTitleSlide).toBe(false);
      expect(slides[1].hasLogoPlaceholder).toBeFalsy();
      expect(slides[1].logoUrl).toBeUndefined();

      expect(slides[2].isTitleSlide).toBe(false);
      expect(slides[2].hasLogoPlaceholder).toBeFalsy();
      expect(slides[2].logoUrl).toBeUndefined();

      expect(slides[3].isTitleSlide).toBe(false);
      expect(slides[3].hasLogoPlaceholder).toBeFalsy();
      expect(slides[3].logoUrl).toBeUndefined();

      // Slide 5 (Closing slide) MUST request logo
      expect(slides[4].isTitleSlide).toBe(false);
      expect(slides[4].hasLogoPlaceholder).toBe(true);

      // When exporting the split.slideOutline, it produces a valid PPTX with only the presentation slides
      const pptxBlob = await exportMarkdownToPptx(split.slideOutline, {
        title: split.slideDeck!.title,
        fallbackLogoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        showWatermark: false,
      });

      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentationml.presentation');
    });

    it('preserves final slide points and does not cut off slide 12 when AI appends conversational outro text', async () => {
      const responseWithOutro = `
# 10x Productivity Playbook for Service-Based Web Dev & Automation
## CEO Roadmap to Scale Team Output & Build a High-Performance Delivery Engine

---

## 1. Executive Summary
- Standardize delivery framework
- Shift to pod-based delivery

---

## 2. Core Service Offerings
- Web application development
- Workflow automation

---

## 3. Tooling & Architecture
- Reusable UI kit
- CI/CD automation

---

## 4. Discovery & Scoping
- Fixed price packages
- Rapid prototyping

---

## 5. Team Pod Structure
- Small multidisciplinary pods
- Direct client communication

---

## 6. Sprint Cadence
- 2-week delivery cycles
- Friday client demos

---

## 7. Quality Assurance
- Automated test suites
- Pre-handoff checklists

---

## 8. Client Onboarding
- Self-service intake portal
- Automated kickoff checklist

---

## 9. Automation Backlog
- Internal task automation
- Automated invoice processing

---

## 10. Client Delivery & Quality
- Discovery template to capture outcomes
- Automated tests before handoff
- Post-launch monitoring

---

## 11. Continuous Improvement Loop
- Retro every 2 weeks: What slowed us? What to automate?
- Monthly 10x review: KPI trends, SOP updates, tool upgrades
- Employee ideas board for automation wins
- Quarterly skill sprints and certifications
- CEO reviews system health, not just sales

---

## 12. Next Steps & Call to Action
- Week 1: Audit current flow and baseline KPIs
- Week 2-3: Build core SOPs and component library
- Week 4: Launch internal automation backlog
- Month 2: Implement pod structure and KPI dashboard
- Commit to 10x by systematizing first, hiring second

Your interactive presentation is ready right here in the presentation carousel. You can preview and swipe through the slides, view presenter mode in fullscreen, change color themes using the Theme button, and download the 16:9 presentation file directly by clicking the Download .pptx button on the presentation card header.

Your deck includes a logo placeholder on the title slide. Once downloaded you can replace it in PowerPoint, Google Slides or Keynote by right-clicking the placeholder image and selecting Change Picture -> This Device to add your official brand logo.
`;

      const split = splitPresentationContent(responseWithOutro);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).toBeDefined();

      // Total slides: Title slide + 12 content slides = 13 slides (NO slides dropped!)
      expect(split.slideDeck!.slides.length).toBe(13);

      // Verify Slide 12 (Continuous Improvement Loop) is present
      const slide11 = split.slideDeck!.slides[11];
      expect(slide11.title).toContain('Continuous Improvement Loop');
      expect(slide11.bullets.length).toBe(5);

      // Verify Slide 13 (Next Steps & Call to Action) is NOT dropped
      const slide12 = split.slideDeck!.slides[12];
      expect(slide12.title).toContain('Next Steps & Call to Action');
      expect(slide12.bullets.length).toBe(5);
      expect(slide12.bullets[0]).toContain('Week 1: Audit current flow');
      expect(slide12.bullets[4]).toContain('Commit to 10x');

      // Verify conversational outro is extracted to bottomText and NOT left in slide bullets
      expect(split.bottomText).toContain('Your interactive presentation is ready right here');
      expect(split.bottomText).toContain('Your deck includes a logo placeholder');

      // Verify exportMarkdownToPptx respects options.hasTitleLogo and options.titleLogoText
      const pptxBlob = await exportMarkdownToPptx(split.slideOutline, {
        title: split.slideDeck!.title,
        hasTitleLogo: true,
        titleLogoText: 'LOGO PLACEHOLDER',
        showWatermark: false,
      });

      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentationml.presentation');
    });

    it('strictly excludes external documents (e.g. CEO Strategic Roadmap) and file access guides from presentation slides', async () => {
      const chatResponse = `
# The 10x Productivity Blueprint
## Scaling Operations with Automation

---

### Core Objectives
- Automate repetitive processes
- Standardize service tiers
- Increase developer velocity

---

### Phase 1: Foundation
- Audit workflows
- Eliminate bottlenecks
- Set up monitoring

---

# CEO Strategic Roadmap (Internal Document)

As requested, I have separated the CEO Strategy from the employee-facing presentation. This roadmap is designed for you to manage the business backend and scaling operations.

- CEO Strategy: Scaling the Service Business
- 1. Business Model Shift: Productized Service
- Standardization: Create 3 tiers of service (e.g., Starter Web, Pro Automation, Enterprise Ecosystem).
- Fixed Scope: Define exactly what is included to prevent "scope creep" which kills productivity.

### How to access your files:
- For the PowerPoint (.pptx):
  - The interactive presentation is ready in the card above. You can preview the slides, change the theme using the Theme button, and download the file by clicking Download .pptx in the presentation header.
  - Note: I have placed ![LOGO PLACEHOLDER] on the title and final slides. Once you open the PPT, right-click them and select "Change Picture" to add your brand logo.

2. For the CEO Strategy (Word/PDF):
- The strategy text above is formatted for a formal report. To download it as a professional document, click the Export (📥) button in the action bar below this message and select Word Document (.docx) or PDF Document (.pdf).
`;

      const split = splitPresentationContent(chatResponse);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).not.toBeNull();

      // The presentation must contain ONLY the 3 presentation slides, NOT 4 or 5!
      expect(split.slideDeck!.slides.length).toBe(3);
      expect(split.slideDeck!.slides[0].title).toBe('The 10x Productivity Blueprint');
      expect(split.slideDeck!.slides[1].title).toBe('Core Objectives');
      expect(split.slideDeck!.slides[2].title).toBe('Phase 1: Foundation');

      // None of the slides must contain the CEO Strategic Roadmap or Access Files text
      const allSlideTitles = split.slideDeck!.slides.map(s => s.title);
      expect(allSlideTitles).not.toContain('CEO Strategic Roadmap (Internal Document)');
      expect(allSlideTitles).not.toContain('How to access your files:');

      // Bottom text MUST preserve the external CEO Roadmap and the download instructions
      expect(split.bottomText).toContain('CEO Strategic Roadmap (Internal Document)');
      expect(split.bottomText).toContain('As requested, I have separated the CEO Strategy');
      expect(split.bottomText).toContain('Business Model Shift: Productized Service');
      expect(split.bottomText).toContain('How to access your files:');
      expect(split.bottomText).toContain('For the PowerPoint (.pptx):');
      expect(split.bottomText).toContain('For the CEO Strategy (Word/PDF):');
    });

    it('seamlessly detects both logo and image placeholders and exports them with #1a1a1a high-contrast styling', async () => {
      // 1. Line detection checks
      expect(isLogoPlaceholderLine('[LOGO PLACEHOLDER]')).toBe(true);
      expect(isLogoPlaceholderLine('[YOUR LOGO HERE]')).toBe(true);
      expect(isLogoPlaceholderLine('[IMAGE PLACEHOLDER]')).toBe(true);
      expect(isLogoPlaceholderLine('[YOUR IMAGE HERE]')).toBe(true);
      expect(isLogoPlaceholderLine('[IMAGE]')).toBe(true);
      expect(isLogoPlaceholderLine('[PRODUCT IMAGE]')).toBe(true);
      expect(isLogoPlaceholderLine('[SCREENSHOT PLACEHOLDER]')).toBe(true);
      expect(isLogoPlaceholderLine('[PHOTO PLACEHOLDER]')).toBe(true);
      expect(isLogoPlaceholderLine('IMAGE PLACEHOLDER')).toBe(true);
      expect(isLogoPlaceholderLine('YOUR IMAGE HERE')).toBe(true);
      expect(isLogoPlaceholderLine('![Product Screenshot]')).toBe(true);

      // 2. Label extraction checks
      expect(extractLogoFromLine('[LOGO PLACEHOLDER]').text).toBe('YOUR LOGO HERE');
      expect(extractLogoFromLine('[IMAGE PLACEHOLDER]').text).toBe('YOUR IMAGE HERE');
      expect(extractLogoFromLine('[IMAGE]').text).toBe('YOUR IMAGE HERE');
      expect(extractLogoFromLine('[PRODUCT IMAGE]').text).toBe('PRODUCT IMAGE');
      expect(extractLogoFromLine('[SCREENSHOT PLACEHOLDER]').text).toBe('SCREENSHOT PLACEHOLDER');
      expect(extractLogoFromLine('![App Dashboard]').text).toBe('App Dashboard');

      // 3. Placeholder Data URL generation produces valid base64 PNG image
      const logoDataUrl = getLogoPlaceholderDataUrl(undefined, 'YOUR LOGO HERE');
      expect(logoDataUrl).toBeDefined();
      expect(logoDataUrl.length).toBeGreaterThan(50);
      expect(logoDataUrl).toContain('data:image/png;base64,');

      const imgDataUrl = getLogoPlaceholderDataUrl(undefined, 'PRODUCT IMAGE');
      expect(imgDataUrl).toBeDefined();
      expect(imgDataUrl).toContain('data:image/png;base64,');

      // 4. Slide deck with image placeholder on content slide
      const presentationWithImage = `
# System Architecture & Roadmap
## Enterprise Scaling Overview

[LOGO PLACEHOLDER]

---

### Cloud Infrastructure
[PRODUCT IMAGE]
- Microservices orchestrated via Kubernetes
- PostgreSQL with automated failover
- Distributed edge caching with Cloudflare
`;

      const parsed = parseMarkdownToSlides(presentationWithImage);
      expect(parsed.title).toBe('System Architecture & Roadmap');
      expect(parsed.hasTitleLogo).toBe(true);
      expect(parsed.titleLogoText).toBe('YOUR LOGO HERE');

      expect(parsed.slides.length).toBe(1);
      const contentSlide = parsed.slides[0];
      expect(contentSlide.title).toBe('Cloud Infrastructure');
      expect(contentSlide.hasLogoPlaceholder).toBe(true);
      expect(contentSlide.logoPlaceholderText).toBe('PRODUCT IMAGE');
      expect(contentSlide.bullets.length).toBe(3);

      // 5. Valid PPTX export
      const pptxBlob = await exportMarkdownToPptx(presentationWithImage, {
        title: 'System Architecture & Roadmap',
      });
      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentationml.presentation');
    });

    it('strictly excludes logos from Slide 1 and exported PPTX when outline contains no logos, even if fallbackLogoUrl is provided', async () => {
      const cleanPresentationWithoutLogos = `
### Slide 1: Title Slide
# The 10x Productivity Blueprint
## Empowering Our Team to Scale

---

### Slide 2: The 10x Vision: Work Smarter, Not Harder
- Our Goal: Build the most efficient agency
- The Philosophy: Increase output through systems
- The Result: Faster deliveries, higher quality

---

### Slide 3: Pillar 1: Engineering Excellence & Reuse
- Component library stops building from scratch
- Standardized UI patterns accelerate delivery
`;

      const parsed = parseMarkdownToSlides(cleanPresentationWithoutLogos);
      expect(parsed.title).toBe('The 10x Productivity Blueprint');
      expect(parsed.hasTitleLogo).toBe(false);
      expect(parsed.titleLogoUrl).toBeUndefined();

      const deck = extractSlideDeck(cleanPresentationWithoutLogos);
      expect(deck).toBeDefined();
      expect(deck!.slides[0].isTitleSlide).toBe(true);
      expect(deck!.slides[0].hasLogoPlaceholder).toBe(false);
      expect(deck!.slides[0].logoUrl).toBeUndefined();

      expect(deck!.slides[1].hasLogoPlaceholder).toBe(false);
      expect(deck!.slides[2].hasLogoPlaceholder).toBe(false);

      // Exporting with fallbackLogoUrl (e.g. from prior chat turns where an image was uploaded)
      // must NOT force a logo onto Slide 1 of a clean presentation!
      const pptxBlob = await exportMarkdownToPptx(cleanPresentationWithoutLogos, {
        title: 'The 10x Productivity Blueprint',
        fallbackLogoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        hasTitleLogo: false,
      });

      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentationml.presentation');
    });

    it('properly separates presentation slides from conversational AI outro text (e.g. Your 9-Slide Presentation with Logo Only)', async () => {
      const responseWithOutroHeader = `
### Slide 1: Title Slide
![Logo](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/sree-ai.png)
# The 10x Productivity Blueprint
## Empowering Our Team to Scale

---

### Slide 2: The 10x Vision
- Systems beat hustle
- Automate repetitive tasks

---

### Slide 3: Engineering Architecture
- Modular component libraries
- Zero regression test suites

---

### Slide 4: Client Delivery
- Continuous integration pipelines
- Rapid customer onboarding

---

### Slide 5: Quality Assurance
- Automated end-to-end tests
- High availability architecture

---

### Slide 6: Continuous Learning
- Weekly engineering syncs
- Code review documentation

---

### Slide 7: Automation Infrastructure
- Webhook-driven pipelines
- Edge caching strategies

---

### Slide 8: Measurable Outcomes
- 10x delivery speed
- 99.9% uptime compliance

---

### Slide 9: Next Steps & Launch
![Logo](https://pub-43593f37b89642548243a2b1f468120e.r2.dev/sree-ai.png)
- Schedule kickoff meeting
- Implement modular frameworks

## Your 9-Slide Presentation with Logo Only
Your 9-slide presentation is ready above! It includes only your brand logo on the opening and closing slides, with all other slides completely clean and free of extra images or placeholders.

- Preview: You can swipe through all 9 slides directly in the interactive presentation viewer above.
- Download PPTX: Click the Download .pptx button in the header of the presentation card above to download your presentation file directly.
`;

      const split = splitPresentationContent(responseWithOutroHeader);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).toBeDefined();

      // Must strictly contain 9 slides, NEVER 10!
      expect(split.slideDeck!.totalSlides).toBe(9);
      expect(split.slideDeck!.slides.length).toBe(9);

      // Slide 9 must be "Next Steps & Launch", NOT the outro!
      const lastSlide = split.slideDeck!.slides[8];
      expect(lastSlide.title).toBe('Next Steps & Launch');
      expect(lastSlide.title).not.toContain('Your 9-Slide');

      // The slide outline must not contain the conversational outro text
      expect(split.slideOutline).not.toContain('Your 9-Slide Presentation with Logo Only');
      expect(split.slideOutline).not.toContain('Download .pptx button in the header');

      // The conversational outro text must be placed in bottomText for outside chat rendering
      expect(split.bottomText).toContain('Your 9-Slide Presentation with Logo Only');
      expect(split.bottomText).toContain('Download PPTX: Click the Download .pptx button');

      // Exporting the outline must generate a clean 9-slide PowerPoint
      const pptxBlob = await exportMarkdownToPptx(split.slideOutline, {
        title: split.slideDeck!.title,
      });
      expect(pptxBlob).toBeDefined();
      expect(pptxBlob.size).toBeGreaterThan(1000);
      expect(pptxBlob.type).toContain('presentationml.presentation');
    });

    it('does NOT truncate legitimate slides titled Presentation Overview or Presentation Summary', async () => {
      const presentationWithOverviewSlides = `
# Executive Strategic Blueprint
## Scaling to Series B

---

## Presentation Overview
- Review of Q1-Q3 metrics and growth velocity
- Operational milestones achieved to date
- Key resource constraints and hiring goals

---

## Technical Infrastructure
- Microservices migration completed
- 99.99% availability achieved

---

## Presentation Summary
- Target ARR reached 3 months ahead of schedule
- Positioned for Series B financing in Q4
`;

      const parsed = parseMarkdownToSlides(presentationWithOverviewSlides);
      expect(parsed.title).toBe('Executive Strategic Blueprint');
      expect(parsed.slides.length).toBe(3); // 3 content slides (Overview + Tech + Summary)
      expect(parsed.slides[0].title).toBe('Presentation Overview');
      expect(parsed.slides[2].title).toBe('Presentation Summary');

      const split = splitPresentationContent(presentationWithOverviewSlides);
      expect(split.hasPresentation).toBe(true);
      expect(split.slideDeck).toBeDefined();
      expect(split.slideDeck!.slides.length).toBe(4);
      expect(split.slideDeck!.slides[1].title).toBe('Presentation Overview');
      expect(split.slideDeck!.slides[3].title).toBe('Presentation Summary');
    });
  });
});




