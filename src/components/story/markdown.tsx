import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  // Links lead out of the app; never let the opened page reach back via window.opener.
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Untrusted Markdown (test case content, tester comments): raw HTML is dropped (`skipHtml`) and the default
 * `urlTransform` blanks `javascript:` and other unsafe URLs. GFM adds lists, tables and autolinks.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 text-sm leading-relaxed break-words",
        "[&_p]:my-1.5 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
        "[&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1 [&_.task-list-item_input]:mr-1.5",
        "[&_a]:font-medium [&_a]:text-link [&_a]:underline [&_a]:underline-offset-3 [&_a:hover]:decoration-2",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-medium",
        "[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
