import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownContent.module.css';

interface MarkdownContentProps {
  source: string;
}

// No rehype-raw: embedded HTML renders as text rather than markup, which is the
// product's requirement and react-markdown's default, so no sanitizer is needed.
export function MarkdownContent({ source }: MarkdownContentProps) {
  return (
    <div className={styles.markdown}>
      <Markdown remarkPlugins={[remarkGfm]}>{source}</Markdown>
    </div>
  );
}
