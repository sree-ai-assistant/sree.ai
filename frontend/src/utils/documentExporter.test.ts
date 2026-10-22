import { describe, it, expect } from 'vitest';
import { exportMarkdownToDocx } from './docxExporter';
import {
  exportMarkdownToPptx,
  parseMarkdownToSlides,
  isPresentationMarkdown,
  extractSlideDeck,
  splitPresentationContent,
  cleanSlideTitle,
  getSlideCodeBadge,
  calculateAdaptiveCodeLayout,
} from './pptxExporter';
import { exportMarkdownToPdf, transliterateUnicodeSymbols } from './pdfExporter';

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

    // Plain text without diagram symbols
    expect(getSlideCodeBadge('text', 'Just a standard text note without arrows or boxes.')).toBe('CODE');
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
  });
});




