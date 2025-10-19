import { log, err } from "~lib/log";

export async function summarizePage(content: string, sharedContext?: string): Promise<string | null> {
  try {
    // Check if Summarizer API is available
    if (!('Summarizer' in self)) {
      log('Summarizer API not available in this browser');
      return null;
    }

    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
      log('Summarizer API not available');
      return null;
    }

    log('Creating summarizer with context:', sharedContext);
    
    const summarizer = await Summarizer.create({
      type: 'tldr',
      format: 'markdown',
      length: 'medium',
      sharedContext,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          log(`Model downloaded ${e.loaded * 100}%`);
        });
      }
    });
    
    // Use batch summarization as recommended by Chrome docs
    // The API processes the input as a whole and produces the output
    const summary = await summarizer.summarize(content, {
      context: sharedContext
    });
    
    log('Generated summary:', summary);
    return summary;
  } catch (error) {
    err('Summarizer API error:', error);
    return null;
  }
}

/**
 * Fallback summarization using only section content when full page is too large
 */
export async function summarizeSections(sectionsWithContent: Array<{title: string, content: string, cssSelector: string, index: number}>, pageTitle: string): Promise<string | null> {
  try {
    // Check if Summarizer API is available
    if (!('Summarizer' in self)) {
      log('Summarizer API not available in this browser');
      return null;
    }

    const availability = await Summarizer.availability();
    if (availability === 'unavailable') {
      log('Summarizer API not available');
      return null;
    }

    // Combine section content into a manageable summary
    const sectionTexts = sectionsWithContent
      .slice(0, 5) // Limit to first 5 sections
      .map(section => `${section.title}: ${section.content}`)
      .join('\n\n');
    
    const combinedContent = `Page: ${pageTitle}\n\nSections:\n${sectionTexts}`;
    const preparedContent = prepareContentForSummarization(combinedContent, 8000); // Even smaller limit
    
    log('Creating summarizer for sections with content length:', preparedContent.length);
    
    const summarizer = await Summarizer.create({
      type: 'tldr',
      format: 'markdown',
      length: 'medium',
      sharedContext: `This is a webpage with multiple sections`,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          log(`Model downloaded ${e.loaded * 100}%`);
        });
      }
    });
    
    const summary = await summarizer.summarize(preparedContent, {
      context: `Summarize the main sections of this webpage: ${pageTitle}`
    });
    
    log('Generated section summary:', summary);
    return summary;
  } catch (error) {
    err('Section summarization error:', error);
    return null;
  }
}

export function formatSummaryWithSections(
  summary: string,
  sectionsWithContent: Array<{title: string, content: string, cssSelector: string, index: number}>
): string {
  // Handle case where there are no sections
  if (!sectionsWithContent || sectionsWithContent.length === 0) {
    return summary;
  }
  
  // Pick 2-3 representative quotes from different sections
  // Use first non-empty sections for quotes
  const quotes = sectionsWithContent.slice(0, 3).map(section => {
    // Extract first meaningful sentence as quote
    const sentences = section.content.match(/[^.!?]+[.!?]+/g) || [];
    const quote = sentences[0]?.trim() || section.content.substring(0, 100);
    return `- From **${section.title}**: "${quote}"`;
  });
  
  // Recommend first section for navigation
  const firstSection = sectionsWithContent[0];
  
  if (quotes.length > 0) {
    return `${summary}

**Key Points:**
${quotes.join('\n')}

**Recommended:** Start with the **${firstSection.title}** section.`;
  } else {
    // If no quotes available, just return the summary with basic recommendation
    return `${summary}

**Recommended:** Start with the **${firstSection.title}** section.`;
  }
}

/**
 * Truncates content to a reasonable length for summarization
 * Based on Chrome docs recommendation to remove unnecessary data
 */
export function prepareContentForSummarization(content: string, maxLength: number = 10000): string {
  // Remove HTML markup and get clean text as recommended by Chrome docs
  let cleanContent = content
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Remove common noise patterns that don't add value to summaries
  cleanContent = cleanContent
    .replace(/\b(click|here|read more|learn more|see also|related|advertisement|sponsored)\b/gi, '')
    .replace(/\b\d+\s*(comments?|likes?|shares?|views?)\b/gi, '')
    .replace(/\b(copyright|all rights reserved|privacy policy|terms of service)\b/gi, '')
    .replace(/\b(facebook|twitter|instagram|linkedin|youtube)\b/gi, '')
    .replace(/\b(login|sign up|register|subscribe|newsletter)\b/gi, '')
    .replace(/\s+/g, ' ') // Normalize whitespace again
    .trim();
  
  // If content is still too long, truncate it intelligently
  if (cleanContent.length > maxLength) {
    log(`Content too long (${cleanContent.length} chars), truncating to ${maxLength} chars`);
    
    // Try to truncate at a sentence boundary
    const truncated = cleanContent.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxLength * 0.8) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
    
    return truncated + '...';
  }
  
  return cleanContent;
}
