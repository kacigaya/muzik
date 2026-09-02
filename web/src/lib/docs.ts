import { promises as fs } from "node:fs";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";

export { getDocSlugs } from "@/lib/docs-nav";

const CONTENT_DIR = path.join(process.cwd(), "content");

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/**
 * The configuration table is wider than a phone. Wrap every table so it scrolls inside
 * its own box instead of stretching the page.
 */
function rehypeScrollableTables() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        walk(child);
        if (child.type !== "element" || child.tagName !== "table") return child;
        return {
          type: "element",
          tagName: "div",
          properties: { className: ["overflow-x-auto"] },
          children: [child],
        } satisfies HastNode;
      });
    };
    walk(tree);
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypePrettyCode, {
    theme: { light: "github-light", dark: "github-dark" },
    keepBackground: false,
  })
  .use(rehypeScrollableTables)
  .use(rehypeStringify);

export interface RenderedDoc {
  html: string;
  title: string;
  description?: string;
}

function parseFrontmatter(raw: string): { body: string; frontmatter: Record<string, string> } {
  if (!raw.startsWith("---\n")) {
    return { body: raw, frontmatter: {} };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { body: raw, frontmatter: {} };
  }

  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + "\n---".length).replace(/^\n/, "");
  const frontmatter = Object.fromEntries(
    block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) return [line, ""];
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
        return [key, value];
      }),
  );

  return { body, frontmatter };
}

export async function getDoc(slug: string[]): Promise<RenderedDoc | null> {
  const relative = slug.length ? path.join(...slug) : "index";
  const filePath = path.join(CONTENT_DIR, `${relative}.md`);
  if (!filePath.startsWith(CONTENT_DIR)) {
    return null;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const { body, frontmatter } = parseFrontmatter(raw);
  const title = frontmatter.title ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Muzik Docs";
  let html = String(await processor.process(body));
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (basePath) {
    html = html.replaceAll('href="/', `href="${basePath}/`);
  }
  return { html, title, description: frontmatter.description };
}
