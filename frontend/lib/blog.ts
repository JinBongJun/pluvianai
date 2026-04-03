import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { z } from 'zod';

const postsDirectory = path.join(process.cwd(), 'content/blog');

/** Kebab-case slugs only — blocks path traversal, odd filenames, and unsafe URL segments. */
const blogSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function isValidBlogSlug(slug: string): boolean {
  return blogSlugSchema.safeParse(slug).success;
}

function parseBlogSlug(slug: string): string {
  return blogSlugSchema.parse(slug.replace(/\.md$/, ''));
}

function assertResolvedUnderPostsDir(resolvedFile: string): void {
  const root = path.resolve(postsDirectory);
  const target = path.resolve(resolvedFile);
  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new Error('Invalid blog post path');
  }
}

export type BlogPostMetadata = {
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
};

export type BlogPost = {
  slug: string;
  metadata: BlogPostMetadata;
  content: string;
};

export function getPostSlugs() {
  if (!fs.existsSync(postsDirectory)) return [];
  return fs
    .readdirSync(postsDirectory)
    .filter((file) => file.endsWith('.md'))
    .filter((file) => isValidBlogSlug(file.replace(/\.md$/, '')));
}

export function getPostBySlug(slug: string): BlogPost {
  const realSlug = parseBlogSlug(slug);
  const fullPath = path.join(postsDirectory, `${realSlug}.md`);
  assertResolvedUnderPostsDir(fullPath);
  const fileContents = fs.readFileSync(fullPath, 'utf8');

  // Use gray-matter to parse the post metadata section
  const { data, content } = matter(fileContents);

  return {
    slug: realSlug,
    metadata: data as BlogPostMetadata,
    content,
  };
}

export function getAllPosts(): BlogPost[] {
  const slugs = getPostSlugs();
  const posts = slugs
    .map((slug) => getPostBySlug(slug))
    // sort posts by date in descending order
    .sort((post1, post2) => (post1.metadata.date > post2.metadata.date ? -1 : 1));
  return posts;
}

/** Use for `<Link href={...}>` so blog routes only ever use validated slugs (addresses static XSS findings). */
export function blogPostHref(slug: string): `/blog/${string}` {
  const s = parseBlogSlug(slug);
  return `/blog/${s}`;
}
