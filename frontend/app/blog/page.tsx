import Link from 'next/link';
import { getAllPosts } from '@/lib/blog';
import { ArrowRight, Terminal } from 'lucide-react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-pluvian-void text-pluvian-text flex flex-col font-sans">
      <Header />
      
      <main className="flex-grow pt-32 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-16">
            <h1 className="text-4xl md:text-5xl font-semibold text-white tracking-tight mb-4 flex items-center gap-3">
              <Terminal className="w-8 h-8 text-pluvian-protocol-400" />
              The Laboratory
            </h1>
            <p className="text-xl text-pluvian-muted max-w-2xl">
              Research, case studies, and field notes on running AI agents in production without breaking things.
            </p>
          </div>

          <div className="space-y-10">
            {posts.map((post) => (
              <article key={post.slug} className="group relative bg-[#0f0f13] border border-pluvian-border rounded-xl p-8 hover:border-pluvian-protocol-500/30 transition-colors">
                <Link href={`/blog/${post.slug}`} className="absolute inset-0 z-10">
                  <span className="sr-only">View {post.metadata.title}</span>
                </Link>
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-sm text-pluvian-muted">
                    <time dateTime={post.metadata.date}>
                      {new Date(post.metadata.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </time>
                  </div>
                  
                  <h2 className="text-2xl font-medium text-white group-hover:text-pluvian-protocol-400 transition-colors">
                    {post.metadata.title}
                  </h2>
                  
                  <p className="text-pluvian-muted leading-relaxed line-clamp-2 md:line-clamp-3">
                    {post.metadata.excerpt}
                  </p>

                  <div className="pt-4 flex items-center justify-between">
                    <div className="flex gap-2">
                      {post.metadata.tags?.map(tag => (
                        <span key={tag} className="px-2.5 py-1 text-xs font-medium bg-[#1a1a24] text-pluvian-protocol-300 rounded-md">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-pluvian-protocol-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Read article <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </article>
            ))}

            {posts.length === 0 && (
              <div className="text-center py-20 text-pluvian-muted border border-dashed border-pluvian-border rounded-xl">
                No articles published yet. check back soon.
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
