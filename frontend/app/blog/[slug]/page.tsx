import { getPostBySlug, getAllPosts } from '@/lib/blog';
import ReactMarkdown from 'react-markdown';
import { notFound } from 'next/navigation';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  try {
    const post = getPostBySlug(params.slug);

    return (
      <div className="min-h-screen bg-pluvian-void text-pluvian-text flex flex-col font-sans">
        <Header />
        
        <main className="flex-grow pt-24 pb-24">
          <article className="max-w-3xl mx-auto px-6">
            <div className="mb-10 pt-8 border-b border-pluvian-border pb-8">
              <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-pluvian-protocol-400 hover:text-pluvian-protocol-300 mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Laboratory
              </Link>
              
              <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight mb-6">
                {post.metadata.title}
              </h1>
              
              <div className="flex items-center gap-4 text-sm text-pluvian-muted">
                <time dateTime={post.metadata.date}>
                  {new Date(post.metadata.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
                <div className="flex gap-2">
                  {post.metadata.tags?.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-[#1a1a24] text-pluvian-protocol-300 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Prose formatting via Tailwind Typography */}
            <div className="prose prose-invert prose-pluvian max-w-none 
                            prose-headings:text-white prose-headings:font-medium 
                            prose-a:text-pluvian-protocol-400 hover:prose-a:text-pluvian-protocol-300
                            prose-strong:text-white prose-code:text-pluvian-eval-300
                            prose-pre:bg-[#0f0f13] prose-pre:border prose-pre:border-pluvian-border">
              <ReactMarkdown>
                {post.content}
              </ReactMarkdown>
            </div>
          </article>
        </main>

        <Footer />
      </div>
    );
  } catch (error) {
    notFound();
  }
}
