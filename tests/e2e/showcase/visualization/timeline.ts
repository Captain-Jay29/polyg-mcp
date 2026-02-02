// Timeline Visualization - ASCII temporal event display

export interface TimelineEvent {
  timestamp: string;
  description: string;
  type?: 'normal' | 'incident' | 'resolution';
  highlight?: boolean;
}

/**
 * Parse ISO timestamp and format as HH:MM
 */
function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '??:??';
  }
}

/**
 * Get date string from ISO timestamp
 */
function formatDate(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown Date';
  }
}

/**
 * Get the icon for an event type
 */
function getEventIcon(event: TimelineEvent): string {
  if (event.type === 'incident') return '▲';
  if (event.type === 'resolution') return '✓';
  return '●';
}

/**
 * Truncate description to fit width
 */
function truncateDescription(desc: string, maxWidth: number): string {
  if (desc.length <= maxWidth) return desc;
  return desc.slice(0, maxWidth - 3) + '...';
}

/**
 * Render a timeline from events
 */
export function renderTimeline(
  events: TimelineEvent[],
  title?: string,
): string {
  if (events.length === 0) {
    return '  (No events to display)\n';
  }

  // Sort events by timestamp
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Group by date
  const dateStr = title ?? formatDate(sorted[0].timestamp);
  const maxDescWidth = 40;

  const lines = ['', `  TIMELINE: ${dateStr}`, '  ' + '─'.repeat(60)];

  for (const event of sorted) {
    const time = formatTime(event.timestamp);
    const icon = getEventIcon(event);
    const desc = truncateDescription(event.description, maxDescWidth);
    const highlight = event.highlight ? '◄── INCIDENT' : '';

    lines.push(
      `  ${time} │ ${icon} ${desc}${highlight ? `  ${highlight}` : ''}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render a compact timeline for inline display
 */
export function renderCompactTimeline(events: TimelineEvent[]): string {
  if (events.length === 0) return '  (No events)';

  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return `  Timeline: ${formatTime(first.timestamp)} → ${formatTime(last.timestamp)} (${events.length} events)`;
}

/**
 * Convert raw temporal expand results to timeline events
 */
export function parseTemporalResults(results: unknown): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (!results || typeof results !== 'object') return events;

  // Handle array of events
  const items = Array.isArray(results) ? results : [results];

  for (const item of items) {
    if (typeof item !== 'object' || !item) continue;

    const record = item as Record<string, unknown>;

    // Look for timestamp field
    const timestamp = record.timestamp || record.time || record.occurred_at;
    if (typeof timestamp !== 'string') continue;

    // Look for description
    const description =
      record.description ||
      record.content ||
      record.text ||
      record.name ||
      'Unknown event';

    // Detect event type from keywords
    let type: TimelineEvent['type'] = 'normal';
    const descLower = String(description).toLowerCase();
    if (
      descLower.includes('crash') ||
      descLower.includes('error') ||
      descLower.includes('fail') ||
      descLower.includes('incident')
    ) {
      type = 'incident';
    } else if (
      descLower.includes('recover') ||
      descLower.includes('fix') ||
      descLower.includes('resolv') ||
      descLower.includes('healthy')
    ) {
      type = 'resolution';
    }

    events.push({
      timestamp: String(timestamp),
      description: String(description),
      type,
      highlight: type === 'incident',
    });
  }

  return events;
}
