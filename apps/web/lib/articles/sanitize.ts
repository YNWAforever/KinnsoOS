import sanitizeHtml from 'sanitize-html'

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'hr',
    'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }, true),
  },
}

/** Sanitize legacy block HTML for safe server-side dangerouslySetInnerHTML. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html ?? '', OPTIONS)
}
