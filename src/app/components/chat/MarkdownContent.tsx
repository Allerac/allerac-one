'use client';

/**
 * Markdown used by local chat and by remote agent replies.
 *
 * `untrusted` (remote replies from paired units): raw HTML is dropped, only
 * http(s)/mailto links survive, and images render as plain links so a reply
 * cannot load trackers. Local chat keeps its previous behaviour.
 */
import { useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const SAFE_URL = /^(https?:|mailto:)/i;

/** Allow only http(s) and mailto for untrusted content; everything else becomes an empty href. */
export function safeUrl(url: string): string {
  return SAFE_URL.test(url.trim()) ? url : '';
}

export function CodeBlock({ code, language, isDarkMode }: { code: string; language: string; isDarkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={`relative group my-3 rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between px-4 py-2 text-xs font-mono ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
        <span>{language}</span>
        <button onClick={copy} className={`flex items-center gap-1.5 transition-colors ${isDarkMode ? 'hover:text-gray-200' : 'hover:text-gray-700'}`}>
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDarkMode ? oneDark : oneLight}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem', lineHeight: '1.6' }}
        showLineNumbers={code.split('\n').length > 5}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

interface Props {
  content: string;
  isDarkMode: boolean;
  untrusted?: boolean;
}

export default function MarkdownContent({ content, isDarkMode, untrusted = false }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml={untrusted}
      urlTransform={untrusted ? safeUrl : defaultUrlTransform}
      components={{
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        a: ({ node, href, ...props }) => (href || !untrusted ? (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:text-brand-800 hover:underline font-medium transition-colors"
          />
        ) : <span>{props.children}</span>),
        ...(untrusted ? {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          img: ({ node, src, alt }) => (typeof src === 'string' && src ? (
            <a href={src} target="_blank" rel="noopener noreferrer" className="underline">{alt || 'image'}</a>
          ) : <span>{alt}</span>),
        } : {}),
        hr: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        code({ node, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const isBlock = !!match;
          const code = String(children).replace(/\n$/, '');
          if (!isBlock) {
            return (
              <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`} {...props}>
                {children}
              </code>
            );
          }
          return (
            <CodeBlock code={code} language={match[1]} isDarkMode={isDarkMode} />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** Prose wrapper classes shared with ChatMessages. */
export function proseClass(isDarkMode: boolean): string {
  return `text-sm leading-relaxed prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-headings:text-gray-100 prose-p:text-gray-100 prose-li:text-gray-100 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-gray-900 prose-pre:text-gray-100' : 'text-gray-900 prose-headings:text-gray-900 prose-p:text-gray-900 prose-li:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900 prose-pre:bg-gray-100 prose-pre:text-gray-900'} prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium prose-hr:hidden prose-p:my-2 prose-headings:my-3`;
}
